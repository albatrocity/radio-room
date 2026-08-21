//! Feed-forward soft-knee sidechain compressor for programme ducking.

use std::f32::consts::PI;

/// Runtime parameters (copied from config; channel indices are **0-based**).
#[derive(Debug, Clone)]
pub struct DuckingParams {
    pub sidechain_left: usize,
    pub sidechain_right: usize,
    pub programme_left: usize,
    pub programme_right: usize,
    pub output_left: usize,
    pub output_right: usize,
    pub threshold_db: f32,
    pub ratio: f32,
    pub attack_ms: f32,
    pub release_ms: f32,
    pub knee_db: f32,
    pub makeup_db: f32,
    pub sidechain_hpf_hz: f32,
    pub bypass: bool,
}

impl DuckingParams {
    pub fn from_feature(f: &crate::config::DuckingFeature) -> Self {
        Self {
            sidechain_left: (f.sidechain_left.saturating_sub(1)) as usize,
            sidechain_right: (f.sidechain_right.saturating_sub(1)) as usize,
            programme_left: (f.programme_left.saturating_sub(1)) as usize,
            programme_right: (f.programme_right.saturating_sub(1)) as usize,
            output_left: (f.output_left.saturating_sub(1)) as usize,
            output_right: (f.output_right.saturating_sub(1)) as usize,
            threshold_db: f.threshold_db,
            ratio: f.ratio.max(1.0),
            attack_ms: f.attack_ms.max(0.01),
            release_ms: f.release_ms.max(1.0),
            knee_db: f.knee_db.max(0.0),
            makeup_db: f.makeup_db,
            sidechain_hpf_hz: f.sidechain_hpf_hz.max(0.0),
            bypass: f.bypass,
        }
    }
}

/// Peak meter values in dB (sidechain / programme / gain reduction).
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Default)]
pub struct DuckingMeters {
    pub sidechain_db: f32,
    pub programme_db: f32,
    pub gain_reduction_db: f32,
}

/// One-pole DC-blocker style high-pass (bilinear) for sidechain key.
#[derive(Debug, Clone)]
struct OnePoleHpf {
    a: f32,
    x1: f32,
    y1: f32,
}

impl OnePoleHpf {
    fn new(sample_rate: f32, cutoff_hz: f32) -> Self {
        let mut s = Self {
            a: 0.0,
            x1: 0.0,
            y1: 0.0,
        };
        s.set_cutoff(sample_rate, cutoff_hz);
        s
    }

    fn set_cutoff(&mut self, sample_rate: f32, cutoff_hz: f32) {
        if cutoff_hz <= 0.0 || sample_rate <= 0.0 {
            self.a = 0.0;
            return;
        }
        let rc = 1.0 / (2.0 * PI * cutoff_hz);
        let dt = 1.0 / sample_rate;
        self.a = rc / (rc + dt);
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        if self.a <= 0.0 {
            return x;
        }
        let y = self.a * (self.y1 + x - self.x1);
        self.x1 = x;
        self.y1 = y;
        y
    }

    #[allow(dead_code)]
    fn reset(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }
}

/// Linked-stereo sidechain compressor.
#[derive(Debug, Clone)]
pub struct SidechainCompressor {
    sample_rate: f32,
    envelope_db: f32,
    gr_db: f32,
    hpf_l: OnePoleHpf,
    hpf_r: OnePoleHpf,
    attack_coef: f32,
    release_coef: f32,
    hpf_hz: f32,
}

impl SidechainCompressor {
    pub fn new(sample_rate: f32) -> Self {
        let sr = sample_rate.max(1.0);
        Self {
            sample_rate: sr,
            envelope_db: -120.0,
            gr_db: 0.0,
            hpf_l: OnePoleHpf::new(sr, 80.0),
            hpf_r: OnePoleHpf::new(sr, 80.0),
            attack_coef: 0.0,
            release_coef: 0.0,
            hpf_hz: 80.0,
        }
    }

    pub fn prepare(&mut self, sample_rate: f32, params: &DuckingParams) {
        self.sample_rate = sample_rate.max(1.0);
        self.attack_coef = time_constant_coef(params.attack_ms, self.sample_rate);
        self.release_coef = time_constant_coef(params.release_ms, self.sample_rate);
        if (params.sidechain_hpf_hz - self.hpf_hz).abs() > 0.01 {
            self.hpf_hz = params.sidechain_hpf_hz;
            self.hpf_l.set_cutoff(self.sample_rate, self.hpf_hz);
            self.hpf_r.set_cutoff(self.sample_rate, self.hpf_hz);
        }
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.envelope_db = -120.0;
        self.gr_db = 0.0;
        self.hpf_l.reset();
        self.hpf_r.reset();
    }

    /// Process one stereo frame. Returns (out_l, out_r, meters for this sample peak).
    #[inline]
    pub fn process_frame(
        &mut self,
        prog_l: f32,
        prog_r: f32,
        key_l: f32,
        key_r: f32,
        params: &DuckingParams,
    ) -> (f32, f32, f32) {
        if params.bypass {
            return (prog_l, prog_r, 0.0);
        }

        let kl = self.hpf_l.process(key_l);
        let kr = self.hpf_r.process(key_r);
        let key_peak = kl.abs().max(kr.abs()).max(1.0e-20);
        let key_db = lin_to_db(key_peak);

        // Ballistics on detector (log domain).
        let coef = if key_db > self.envelope_db {
            self.attack_coef
        } else {
            self.release_coef
        };
        self.envelope_db += coef * (key_db - self.envelope_db);

        let target_gr = soft_knee_gain_reduction_db(
            self.envelope_db,
            params.threshold_db,
            params.ratio,
            params.knee_db,
        );
        // Instant GR from smoothed detector (single envelope ballistics).
        self.gr_db = target_gr;

        let gain = db_to_lin(-self.gr_db + params.makeup_db);
        (prog_l * gain, prog_r * gain, self.gr_db)
    }
}

#[inline]
fn time_constant_coef(time_ms: f32, sample_rate: f32) -> f32 {
    let t = (time_ms.max(0.01) as f64) / 1000.0;
    let sr = sample_rate as f64;
    (1.0 - (-1.0 / (t * sr)).exp()) as f32
}

#[inline]
pub fn lin_to_db(lin: f32) -> f32 {
    20.0 * lin.max(1.0e-20).log10()
}

#[inline]
pub fn db_to_lin(db: f32) -> f32 {
    (10.0f32).powf(db / 20.0)
}

/// Soft-knee feed-forward GR in dB (positive = reduce).
pub fn soft_knee_gain_reduction_db(level_db: f32, threshold_db: f32, ratio: f32, knee_db: f32) -> f32 {
    let ratio = ratio.max(1.0);
    let knee = knee_db.max(0.0);
    let over = level_db - threshold_db;

    let compressed_over = if knee <= 0.0 {
        if over <= 0.0 {
            0.0
        } else {
            over
        }
    } else if over < -knee / 2.0 {
        0.0
    } else if over > knee / 2.0 {
        over
    } else {
        // Quadratic soft knee (over + knee/2)^2 / (2 * knee)
        let x = over + knee / 2.0;
        (x * x) / (2.0 * knee)
    };

    if compressed_over <= 0.0 {
        0.0
    } else {
        compressed_over * (1.0 - 1.0 / ratio)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_key_yields_zero_gr() {
        let mut c = SidechainCompressor::new(48_000.0);
        let p = DuckingParams {
            sidechain_left: 0,
            sidechain_right: 1,
            programme_left: 2,
            programme_right: 3,
            output_left: 4,
            output_right: 5,
            threshold_db: -31.5,
            ratio: 100.0,
            attack_ms: 2.9,
            release_ms: 1714.0,
            knee_db: 6.0,
            makeup_db: 0.0,
            sidechain_hpf_hz: 80.0,
            bypass: false,
        };
        c.prepare(48_000.0, &p);
        let mut max_gr = 0.0f32;
        for _ in 0..2048 {
            let (_l, _r, gr) = c.process_frame(0.5, 0.5, 0.0, 0.0, &p);
            max_gr = max_gr.max(gr);
        }
        assert!(max_gr < 0.5, "expected ~0 GR, got {max_gr}");
    }

    #[test]
    fn loud_key_ducks_programme() {
        let mut c = SidechainCompressor::new(48_000.0);
        let p = DuckingParams {
            sidechain_left: 0,
            sidechain_right: 1,
            programme_left: 2,
            programme_right: 3,
            output_left: 4,
            output_right: 5,
            threshold_db: -31.5,
            ratio: 100.0,
            attack_ms: 2.9,
            release_ms: 1714.0,
            knee_db: 6.0,
            makeup_db: 0.0,
            sidechain_hpf_hz: 0.0,
            bypass: false,
        };
        c.prepare(48_000.0, &p);
        // 0 dBFS key → well above −31.5 threshold → near-infinite ratio → large GR
        for _ in 0..4800 {
            let _ = c.process_frame(0.8, 0.8, 1.0, 1.0, &p);
        }
        let mut out_peak = 0.0f32;
        let mut gr_peak = 0.0f32;
        for _ in 0..512 {
            let (l, r, gr) = c.process_frame(0.8, 0.8, 1.0, 1.0, &p);
            out_peak = out_peak.max(l.abs()).max(r.abs());
            gr_peak = gr_peak.max(gr);
        }
        assert!(gr_peak > 20.0, "expected substantial GR, got {gr_peak}");
        assert!(out_peak < 0.2, "ducked programme should be quiet, got {out_peak}");
    }

    #[test]
    fn bypass_passes_through() {
        let mut c = SidechainCompressor::new(48_000.0);
        let p = DuckingParams {
            sidechain_left: 0,
            sidechain_right: 1,
            programme_left: 2,
            programme_right: 3,
            output_left: 4,
            output_right: 5,
            threshold_db: -60.0,
            ratio: 100.0,
            attack_ms: 1.0,
            release_ms: 100.0,
            knee_db: 0.0,
            makeup_db: 0.0,
            sidechain_hpf_hz: 0.0,
            bypass: true,
        };
        c.prepare(48_000.0, &p);
        let (l, r, gr) = c.process_frame(0.7, -0.3, 1.0, 1.0, &p);
        assert!((l - 0.7).abs() < 1e-6);
        assert!((r + 0.3).abs() < 1e-6);
        assert_eq!(gr, 0.0);
    }

    #[test]
    fn soft_knee_zero_below_threshold() {
        let gr = soft_knee_gain_reduction_db(-40.0, -31.5, 100.0, 6.0);
        assert_eq!(gr, 0.0);
    }

    #[test]
    fn soft_knee_hard_ratio_above() {
        // 0 dBFS, threshold -31.5, ratio 100 → over≈31.5, GR ≈ 31.5 * 0.99 ≈ 31.2
        let gr = soft_knee_gain_reduction_db(0.0, -31.5, 100.0, 0.0);
        assert!((gr - 31.5 * (1.0 - 1.0 / 100.0)).abs() < 0.01);
    }

    #[test]
    fn hpf_reduces_low_frequency_key() {
        let mut c = SidechainCompressor::new(48_000.0);
        let mut p = DuckingParams {
            sidechain_left: 0,
            sidechain_right: 1,
            programme_left: 2,
            programme_right: 3,
            output_left: 4,
            output_right: 5,
            threshold_db: -40.0,
            ratio: 100.0,
            attack_ms: 1.0,
            release_ms: 50.0,
            knee_db: 0.0,
            makeup_db: 0.0,
            sidechain_hpf_hz: 0.0,
            bypass: false,
        };
        c.prepare(48_000.0, &p);

        // 20 Hz sine at full scale — without HPF should duck hard
        let mut phase = 0.0f32;
        let step = 2.0 * PI * 20.0 / 48_000.0;
        let mut gr_no_hpf = 0.0f32;
        for _ in 0..48000 {
            let s = phase.sin();
            phase += step;
            let (_l, _r, gr) = c.process_frame(0.5, 0.5, s, s, &p);
            gr_no_hpf = gr_no_hpf.max(gr);
        }

        c.reset();
        p.sidechain_hpf_hz = 80.0;
        c.prepare(48_000.0, &p);
        phase = 0.0;
        let mut gr_hpf = 0.0f32;
        for _ in 0..48000 {
            let s = phase.sin();
            phase += step;
            let (_l, _r, gr) = c.process_frame(0.5, 0.5, s, s, &p);
            gr_hpf = gr_hpf.max(gr);
        }

        assert!(
            gr_hpf < gr_no_hpf - 5.0,
            "HPF should reduce LF key GR: with={gr_hpf} without={gr_no_hpf}"
        );
    }

    #[test]
    fn attack_reaches_near_target_quickly() {
        let mut c = SidechainCompressor::new(48_000.0);
        let p = DuckingParams {
            sidechain_left: 0,
            sidechain_right: 1,
            programme_left: 2,
            programme_right: 3,
            output_left: 4,
            output_right: 5,
            threshold_db: -31.5,
            ratio: 100.0,
            attack_ms: 2.9,
            release_ms: 1714.0,
            knee_db: 0.0,
            makeup_db: 0.0,
            sidechain_hpf_hz: 0.0,
            bypass: false,
        };
        c.prepare(48_000.0, &p);
        // ~5× attack time at 48 kHz (envelope must climb from −120 dBFS)
        let n = ((2.9 / 1000.0) * 48_000.0 * 5.0) as usize;
        let mut gr = 0.0f32;
        for _ in 0..n {
            let (_l, _r, g) = c.process_frame(1.0, 1.0, 1.0, 1.0, &p);
            gr = g;
        }
        let target = soft_knee_gain_reduction_db(0.0, -31.5, 100.0, 0.0);
        assert!(
            gr > target * 0.85,
            "after ~5 attack times GR {gr} should be near target {target}"
        );
    }
}
