//! Core Audio I/O via cpal — dedicated realtime streams for Loopback ducking.

use crate::config::DuckingFeature;
use crate::ducking::dsp::{lin_to_db, DuckingParams, SidechainCompressor};
use arc_swap::ArcSwap;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use rtrb::{Consumer, Producer, RingBuffer};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use tracing::{error, info, warn};

/// Pack f32 as bits into AtomicU32 for lock-free meter reads.
fn store_f32(atom: &AtomicU32, v: f32) {
    atom.store(v.to_bits(), Ordering::Relaxed);
}

fn load_f32(atom: &AtomicU32) -> f32 {
    f32::from_bits(atom.load(Ordering::Relaxed))
}

#[derive(Debug, Default)]
pub struct SharedMeters {
    pub sidechain_db: AtomicU32,
    pub programme_db: AtomicU32,
    pub gain_reduction_db: AtomicU32,
}

impl SharedMeters {
    pub fn snapshot(&self) -> (f32, f32, f32) {
        (
            load_f32(&self.sidechain_db),
            load_f32(&self.programme_db),
            load_f32(&self.gain_reduction_db),
        )
    }
}

pub struct EngineHandle {
    stop: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
    pub meters: Arc<SharedMeters>,
    pub params: Arc<ArcSwap<DuckingParams>>,
}

impl EngineHandle {
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    fn request_stop_and_join(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
        self.alive.store(false, Ordering::SeqCst);
    }

    pub fn stop(mut self) {
        self.request_stop_and_join();
    }
}

impl Drop for EngineHandle {
    fn drop(&mut self) {
        // Prevent leaked Loopback output clients if the handle is overwritten.
        self.request_stop_and_join();
    }
}

/// Spawn a dedicated OS thread that owns cpal streams until `stop` is set.
pub fn start_engine(feature: &DuckingFeature) -> Result<EngineHandle, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = feature;
        return Err("ducking audio engine requires macOS".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        start_engine_macos(feature)
    }
}

#[cfg(target_os = "macos")]
fn start_engine_macos(feature: &DuckingFeature) -> Result<EngineHandle, String> {
    let params = Arc::new(ArcSwap::from_pointee(DuckingParams::from_feature(feature)));
    let meters = Arc::new(SharedMeters::default());
    let stop = Arc::new(AtomicBool::new(false));
    let alive = Arc::new(AtomicBool::new(true));
    let device_name = feature.device_name.clone();
    let device_uid = feature.device_uid.clone();

    let stop_t = stop.clone();
    let alive_t = alive.clone();
    let params_t = params.clone();
    let meters_t = meters.clone();
    let name_t = device_name.clone();

    let join = thread::Builder::new()
        .name("ducking-audio".into())
        .spawn(move || {
            let result = run_streams(&name_t, device_uid.as_deref(), params_t, meters_t, stop_t);
            alive_t.store(false, Ordering::SeqCst);
            if let Err(e) = result {
                error!("ducking engine exited: {e}");
            }
        })
        .map_err(|e| format!("spawn ducking thread: {e}"))?;

    // Brief settle so open errors surface via meters/status on first supervisor poll.
    thread::sleep(std::time::Duration::from_millis(80));
    if !alive.load(Ordering::SeqCst) {
        let _ = join.join();
        return Err(format!(
            "ducking engine failed to open device `{device_name}` (see logs)"
        ));
    }

    Ok(EngineHandle {
        stop,
        alive,
        join: Some(join),
        meters,
        params,
    })
}

#[cfg(target_os = "macos")]
fn run_streams(
    device_name: &str,
    device_uid: Option<&str>,
    params: Arc<ArcSwap<DuckingParams>>,
    meters: Arc<SharedMeters>,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let host = cpal::default_host();
    let in_dev = find_device(&host, device_name, device_uid, true)?;
    let out_dev = find_device(&host, device_name, device_uid, false)?;

    let in_cfg = pick_config(&in_dev, true)?;
    let out_cfg = pick_config(&out_dev, false)?;

    let in_channels = in_cfg.channels as usize;
    let out_channels = out_cfg.channels as usize;
    let sample_rate = in_cfg.sample_rate.0 as f32;

    info!(
        device = %device_name,
        in_channels,
        out_channels,
        sample_rate,
        "ducking engine opening streams"
    );

    // Ring carries 4 floats per frame: key_l, key_r, prog_l, prog_r
    let capacity = (sample_rate as usize).max(2048) * 4;
    let (prod, cons) = RingBuffer::<f32>::new(capacity);

    let err_fn = |e| error!("ducking stream error: {e}");

    let in_stream = build_input_stream(
        &in_dev,
        &in_cfg,
        in_channels,
        params.clone(),
        prod,
        err_fn,
    )?;
    let out_stream = build_output_stream(
        &out_dev,
        &out_cfg,
        out_channels,
        sample_rate,
        params,
        meters,
        cons,
        err_fn,
    )?;

    in_stream.play().map_err(|e| format!("input play: {e}"))?;
    out_stream
        .play()
        .map_err(|e| format!("output play: {e}"))?;

    while !stop.load(Ordering::SeqCst) {
        thread::sleep(std::time::Duration::from_millis(50));
    }

    drop(in_stream);
    drop(out_stream);
    info!("ducking engine stopped");
    Ok(())
}

#[cfg(target_os = "macos")]
fn find_device(
    host: &cpal::Host,
    name: &str,
    uid: Option<&str>,
    input: bool,
) -> Result<Device, String> {
    let _ = uid; // cpal does not expose UID portably; name match is primary.
    let devices = if input {
        host.input_devices()
            .map_err(|e| format!("list input devices: {e}"))?
    } else {
        host.output_devices()
            .map_err(|e| format!("list output devices: {e}"))?
    };

    let mut fallback = None;
    for d in devices {
        let Ok(n) = d.name() else { continue };
        if n == name {
            return Ok(d);
        }
        if n.contains(name) {
            fallback = Some(d);
        }
    }
    fallback.ok_or_else(|| format!("audio device not found: {name}"))
}

#[cfg(target_os = "macos")]
fn pick_config(device: &Device, input: bool) -> Result<StreamConfig, String> {
    let supported = if input {
        device
            .default_input_config()
            .map_err(|e| format!("default input config: {e}"))?
    } else {
        device
            .default_output_config()
            .map_err(|e| format!("default output config: {e}"))?
    };

    if supported.sample_format() != SampleFormat::F32 {
        warn!(
            "device default format is {:?}; requesting F32",
            supported.sample_format()
        );
    }

    Ok(StreamConfig {
        channels: supported.channels(),
        sample_rate: supported.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    })
}

#[cfg(target_os = "macos")]
fn build_input_stream(
    device: &Device,
    config: &StreamConfig,
    in_channels: usize,
    params: Arc<ArcSwap<DuckingParams>>,
    mut prod: Producer<f32>,
    err_fn: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<Stream, String> {
    let stream = device
        .build_input_stream(
            config,
            move |data: &[f32], _| {
                let p = params.load();
                let frames = data.len() / in_channels;
                for f in 0..frames {
                    let base = f * in_channels;
                    let kl = data.get(base + p.sidechain_left).copied().unwrap_or(0.0);
                    let kr = data.get(base + p.sidechain_right).copied().unwrap_or(0.0);
                    let pl = data.get(base + p.programme_left).copied().unwrap_or(0.0);
                    let pr = data.get(base + p.programme_right).copied().unwrap_or(0.0);
                    // Drop frame if ring is full (stay realtime-safe).
                    if prod.slots() < 4 {
                        continue;
                    }
                    let _ = prod.push(kl);
                    let _ = prod.push(kr);
                    let _ = prod.push(pl);
                    let _ = prod.push(pr);
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("build input stream: {e}"))?;
    Ok(stream)
}

#[cfg(target_os = "macos")]
#[allow(clippy::too_many_arguments)]
fn build_output_stream(
    device: &Device,
    config: &StreamConfig,
    out_channels: usize,
    sample_rate: f32,
    params: Arc<ArcSwap<DuckingParams>>,
    meters: Arc<SharedMeters>,
    mut cons: Consumer<f32>,
    err_fn: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<Stream, String> {
    let mut dsp = SidechainCompressor::new(sample_rate);
    {
        let p = params.load();
        dsp.prepare(sample_rate, &p);
    }
    let mut peak_key = 0.0f32;
    let mut peak_prog = 0.0f32;
    let mut meter_counter = 0u32;

    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [f32], _| {
                // Silence all channels first (our contribution only; Loopback mixes other apps).
                for s in data.iter_mut() {
                    *s = 0.0;
                }

                let p = params.load();
                dsp.prepare(sample_rate, &p);

                let frames = data.len() / out_channels;
                for f in 0..frames {
                    let (kl, kr, pl, pr) = if cons.slots() >= 4 {
                        (
                            cons.pop().unwrap_or(0.0),
                            cons.pop().unwrap_or(0.0),
                            cons.pop().unwrap_or(0.0),
                            cons.pop().unwrap_or(0.0),
                        )
                    } else {
                        (0.0, 0.0, 0.0, 0.0)
                    };

                    peak_key = peak_key.max(kl.abs()).max(kr.abs());
                    peak_prog = peak_prog.max(pl.abs()).max(pr.abs());

                    let (ol, or_, gr) = dsp.process_frame(pl, pr, kl, kr, &p);
                    if let Some(s) = data.get_mut(f * out_channels + p.output_left) {
                        *s = ol;
                    }
                    if let Some(s) = data.get_mut(f * out_channels + p.output_right) {
                        *s = or_;
                    }

                    meter_counter += 1;
                    if meter_counter >= 512 {
                        store_f32(&meters.sidechain_db, lin_to_db(peak_key));
                        store_f32(&meters.programme_db, lin_to_db(peak_prog));
                        store_f32(&meters.gain_reduction_db, gr);
                        peak_key = 0.0;
                        peak_prog = 0.0;
                        meter_counter = 0;
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("build output stream: {e}"))?;
    Ok(stream)
}
