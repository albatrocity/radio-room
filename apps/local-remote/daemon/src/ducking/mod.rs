//! Sidechain ducking engine for Loopback (Ableton compressor replacement).

pub mod dsp;
pub mod engine;
pub mod supervisor;

pub use supervisor::{run_ducking_supervisor, DuckingSupervisor};
