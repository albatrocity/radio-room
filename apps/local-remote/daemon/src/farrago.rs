//! In-memory model of Farrago board state from incoming OSC messages.

use rosc::OscType;
use serde::Serialize;
use std::collections::HashMap;
use tracing::debug;

/// Number of colors in Farrago's palette (purple → black).
const FARRAGO_COLOR_COUNT: f32 = 9.0;

/// Farrago color palette (matches the order in Farrago Settings → Tiles → color picker).
pub fn farrago_color_index_to_hex(index: i32) -> String {
    match index {
        0 => "#7c3aed".to_string(),  // purple / violet
        1 => "#d946ef".to_string(),  // magenta / hot-pink
        2 => "#dc2626".to_string(),  // red / crimson
        3 => "#ea580c".to_string(),  // burnt orange
        4 => "#f97316".to_string(),  // orange
        5 => "#16a34a".to_string(),  // green
        6 => "#06b6d4".to_string(),  // cyan / teal
        7 => "#2563eb".to_string(),  // blue
        8 => "#171717".to_string(),  // black / very dark
        _ => "#4b5563".to_string(),  // fallback slate
    }
}

fn osc_color_to_hex(c: &rosc::OscColor) -> String {
    format!("#{:02x}{:02x}{:02x}", c.red, c.green, c.blue)
}

#[derive(Debug, Clone, Default)]
pub struct FarragoTile {
    pub title: Option<String>,
    pub notes: Option<String>,
    /// Raw integer index (if color came as Int/Float).
    pub color_index: Option<i32>,
    /// CSS hex (derived from index palette or OscColor RGBA).
    pub color_hex: Option<String>,
    pub volume: Option<f32>,
    pub duration: Option<f32>,
    pub playing: bool,
    pub allow_pausing: bool,
    pub remaining_time: Option<f32>,
    pub current_time: Option<f32>,
    pub emoji: Option<String>,
}

#[derive(Debug, Clone)]
pub enum SetRef {
    Index(usize),
    Selected,
}

#[derive(Debug, Clone)]
pub struct TileAddress {
    pub set: SetRef,
    pub x: usize,
    pub y: usize,
    pub endpoint: String,
}

/// Parse `/set/{n|selected}/tile/{x}/{y}/{endpoint}`.
pub fn parse_tile_osc_address(addr: &str) -> Option<TileAddress> {
    let s = addr.trim();
    if !s.starts_with('/') {
        return None;
    }
    let parts: Vec<&str> = s.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 6 {
        return None;
    }
    if parts[0] != "set" {
        return None;
    }
    if parts[2] != "tile" {
        return None;
    }
    let set = if parts[1] == "selected" {
        SetRef::Selected
    } else {
        SetRef::Index(parts[1].parse().ok()?)
    };
    let x: usize = parts[3].parse().ok()?;
    let y: usize = parts[4].parse().ok()?;
    let endpoint = parts[5..].join("/");
    if endpoint.is_empty() {
        return None;
    }
    Some(TileAddress {
        set,
        x,
        y,
        endpoint,
    })
}

fn first_string(args: &[OscType]) -> Option<String> {
    args.iter().find_map(|a| match a {
        OscType::String(s) => Some(s.clone()),
        _ => None,
    })
}

fn first_float(args: &[OscType]) -> Option<f32> {
    args.iter().find_map(|a| match a {
        OscType::Float(f) => Some(*f),
        OscType::Double(d) => Some(*d as f32),
        OscType::Int(i) => Some(*i as f32),
        OscType::Long(l) => Some(*l as f32),
        _ => None,
    })
}

fn first_int(args: &[OscType]) -> Option<i32> {
    args.iter().find_map(|a| match a {
        OscType::Int(i) => Some(*i),
        OscType::Long(l) => Some(*l as i32),
        _ => None,
    })
}

fn first_osc_color(args: &[OscType]) -> Option<rosc::OscColor> {
    args.iter().find_map(|a| match a {
        OscType::Color(c) => Some(c.clone()),
        _ => None,
    })
}

#[derive(Debug, Clone, Default)]
pub struct FarragoBoard {
    pub sets: HashMap<usize, HashMap<(usize, usize), FarragoTile>>,
    pub selected_mirror: HashMap<(usize, usize), FarragoTile>,
}

impl FarragoBoard {
    pub fn apply_message(&mut self, addr: &str, args: &[OscType]) {
        let Some(parsed) = parse_tile_osc_address(addr) else {
            return;
        };
        let ep = parsed.endpoint.as_str();
        let tile = match parsed.set {
            SetRef::Index(si) => self
                .sets
                .entry(si)
                .or_default()
                .entry((parsed.x, parsed.y))
                .or_default(),
            SetRef::Selected => self
                .selected_mirror
                .entry((parsed.x, parsed.y))
                .or_default(),
        };

        match ep {
            "title" => {
                if let Some(t) = first_string(args) {
                    tile.title = Some(t);
                }
            }
            "notes" => {
                if let Some(n) = first_string(args) {
                    tile.notes = Some(n);
                }
            }
            "color" => {
                if let Some(c) = first_osc_color(args) {
                    let hex = osc_color_to_hex(&c);
                    debug!(hex = %hex, r = c.red, g = c.green, b = c.blue, addr = %addr, "color via OscColor RGBA");
                    tile.color_hex = Some(hex);
                    tile.color_index = None;
                } else if let Some(idx) = first_int(args) {
                    debug!(index = idx, addr = %addr, "color via Int");
                    tile.color_index = Some(idx);
                    tile.color_hex = Some(farrago_color_index_to_hex(idx));
                } else if let Some(f) = first_float(args) {
                    // Farrago sends color as a normalized float 0.0–1.0
                    // across its 9-color palette (step = 1/8 = 0.125).
                    let idx = (f * (FARRAGO_COLOR_COUNT - 1.0)).round() as i32;
                    debug!(float_raw = %f, index = idx, addr = %addr, "color via Float");
                    tile.color_index = Some(idx);
                    tile.color_hex = Some(farrago_color_index_to_hex(idx));
                } else {
                    let types: Vec<String> = args.iter().map(|a| format!("{a:?}")).collect();
                    debug!(raw_args = ?types, addr = %addr, "color: unrecognized arg types");
                }
            }
            "volume" => {
                if let Some(v) = first_float(args) {
                    tile.volume = Some(v);
                }
            }
            "duration" => {
                if let Some(d) = first_float(args) {
                    tile.duration = Some(d);
                }
            }
            "play" => {
                if let Some(f) = first_float(args) {
                    tile.playing = f > 0.5;
                } else if let Some(i) = first_int(args) {
                    tile.playing = i != 0;
                }
            }
            "allowPausing" => {
                if let Some(f) = first_float(args) {
                    tile.allow_pausing = f > 0.5;
                } else if let Some(i) = first_int(args) {
                    tile.allow_pausing = i != 0;
                }
            }
            "remainingTime" => {
                if let Some(f) = first_float(args) {
                    tile.remaining_time = Some(f);
                }
            }
            "currentTime" => {
                if let Some(f) = first_float(args) {
                    tile.current_time = Some(f);
                }
            }
            "icon" | "emoji" => {
                if let Some(e) = first_string(args) {
                    tile.emoji = if e.is_empty() { None } else { Some(e) };
                }
            }
            "currentPosition" | "fadeOut" | "holdToPlay" | "loop" | "mute"
            | "select" | "solo" | "toggleAB"
            | "peakMeterL" | "peakMeterR" | "rmsMeterL" | "rmsMeterR"
            | "back" => {}
            _ => {
                debug!(endpoint = ep, addr = %addr, "unhandled tile endpoint");
            }
        }
    }

    pub fn has_any_playing(&self) -> bool {
        self.sets
            .values()
            .any(|s| s.values().any(|t| derive_playing(t)))
            || self.selected_mirror.values().any(|t| derive_playing(t))
    }

    pub fn snapshot(&self) -> FarragoBoardSnapshot {
        let mut set_indices: Vec<usize> = self.sets.keys().copied().collect();
        set_indices.sort_unstable();

        let sets: Vec<FarragoSetSnapshot> = set_indices
            .into_iter()
            .map(|set_index| {
                let tiles_map = self.sets.get(&set_index).cloned().unwrap_or_default();
                let mut keys: Vec<(usize, usize)> = tiles_map.keys().copied().collect();
                keys.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
                let tiles: Vec<FarragoTileSnapshot> = keys
                    .into_iter()
                    .filter_map(|(x, y)| {
                        tiles_map.get(&(x, y)).map(|t| tile_to_snapshot(set_index, x, y, t))
                    })
                    .collect();
                FarragoSetSnapshot { set_index, tiles }
            })
            .collect();

        let mut sk: Vec<(usize, usize)> = self.selected_mirror.keys().copied().collect();
        sk.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        let selected_mirror: Vec<FarragoTileSnapshot> = sk
            .into_iter()
            .filter_map(|(x, y)| {
                self.selected_mirror
                    .get(&(x, y))
                    .map(|t| tile_to_snapshot_selected(x, y, t))
            })
            .collect();

        FarragoBoardSnapshot {
            sets,
            selected_mirror,
        }
    }
}

/// A tile is playing when remainingTime is meaningfully less than duration
/// (idle tiles report remainingTime == duration). Falls back to the raw
/// `play` endpoint value when duration/remainingTime aren't available.
fn derive_playing(t: &FarragoTile) -> bool {
    if let (Some(rem), Some(dur)) = (t.remaining_time, t.duration) {
        if dur > 0.1 {
            return rem < dur - 0.05 && rem > 0.05;
        }
    }
    t.playing
}

fn tile_to_snapshot_inner(set_index: Option<usize>, x: usize, y: usize, t: &FarragoTile) -> FarragoTileSnapshot {
    FarragoTileSnapshot {
        set_index,
        x,
        y,
        title: t.title.clone(),
        notes: t.notes.clone(),
        color: t.color_index,
        color_hex: t.color_hex.clone(),
        volume: t.volume,
        duration: t.duration,
        playing: derive_playing(t),
        allow_pausing: t.allow_pausing,
        emoji: t.emoji.clone(),
    }
}

fn tile_to_snapshot(set_index: usize, x: usize, y: usize, t: &FarragoTile) -> FarragoTileSnapshot {
    tile_to_snapshot_inner(Some(set_index), x, y, t)
}

fn tile_to_snapshot_selected(x: usize, y: usize, t: &FarragoTile) -> FarragoTileSnapshot {
    tile_to_snapshot_inner(None, x, y, t)
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FarragoBoardSnapshot {
    pub sets: Vec<FarragoSetSnapshot>,
    pub selected_mirror: Vec<FarragoTileSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FarragoSetSnapshot {
    pub set_index: usize,
    pub tiles: Vec<FarragoTileSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FarragoTileSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_index: Option<usize>,
    pub x: usize,
    pub y: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_hex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f32>,
    pub playing: bool,
    pub allow_pausing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_numeric_set() {
        let t = parse_tile_osc_address("/set/2/tile/1/0/title").unwrap();
        assert!(matches!(t.set, SetRef::Index(2)));
        assert_eq!(t.x, 1);
        assert_eq!(t.y, 0);
        assert_eq!(t.endpoint, "title");
    }

    #[test]
    fn parse_selected() {
        let t = parse_tile_osc_address("/set/selected/tile/0/3/play").unwrap();
        assert!(matches!(t.set, SetRef::Selected));
        assert_eq!(t.x, 0);
        assert_eq!(t.y, 3);
    }

    #[test]
    fn apply_updates_tile() {
        let mut b = FarragoBoard::default();
        b.apply_message(
            "/set/0/tile/1/2/title",
            &[OscType::String("Intro".into())],
        );
        b.apply_message("/set/0/tile/1/2/color", &[OscType::Int(4)]);
        b.apply_message("/set/0/tile/1/2/play", &[OscType::Float(1.0)]);
        let snap = b.snapshot();
        assert_eq!(snap.sets.len(), 1);
        assert_eq!(snap.sets[0].tiles.len(), 1);
        let tile = &snap.sets[0].tiles[0];
        assert_eq!(tile.title.as_deref(), Some("Intro"));
        assert_eq!(tile.color, Some(4));
        assert_eq!(tile.color_hex.as_deref(), Some("#f97316"));
        assert!(tile.playing);
    }

    #[test]
    fn apply_osc_color_rgba() {
        let mut b = FarragoBoard::default();
        b.apply_message(
            "/set/0/tile/0/0/color",
            &[OscType::Color(rosc::OscColor {
                red: 0xdc,
                green: 0x26,
                blue: 0x26,
                alpha: 0xff,
            })],
        );
        let snap = b.snapshot();
        let tile = &snap.sets[0].tiles[0];
        assert_eq!(tile.color_hex.as_deref(), Some("#dc2626"));
        assert_eq!(tile.color, None);
    }

    #[test]
    fn playing_derived_from_remaining_vs_duration() {
        let mut b = FarragoBoard::default();
        // Set duration first, then remainingTime equal to it → idle
        b.apply_message("/set/0/tile/0/0/duration", &[OscType::Float(30.0)]);
        b.apply_message("/set/0/tile/0/0/remainingTime", &[OscType::Float(30.0)]);
        let snap = b.snapshot();
        assert!(!snap.sets[0].tiles[0].playing, "remainingTime == duration → idle");

        // Now simulate playing: remainingTime < duration
        b.apply_message("/set/0/tile/0/0/remainingTime", &[OscType::Float(25.0)]);
        let snap = b.snapshot();
        assert!(snap.sets[0].tiles[0].playing, "remainingTime < duration → playing");

        // Sound finished: remainingTime ≈ 0
        b.apply_message("/set/0/tile/0/0/remainingTime", &[OscType::Float(0.0)]);
        let snap = b.snapshot();
        assert!(!snap.sets[0].tiles[0].playing, "remainingTime ≈ 0 → finished, not playing");
    }

    #[test]
    fn allow_pausing_parsed() {
        let mut b = FarragoBoard::default();
        b.apply_message("/set/0/tile/0/0/allowPausing", &[OscType::Float(1.0)]);
        let snap = b.snapshot();
        assert!(snap.sets[0].tiles[0].allow_pausing);
    }

    #[test]
    fn has_any_playing_checks_all_sets() {
        let mut b = FarragoBoard::default();
        assert!(!b.has_any_playing());
        b.apply_message("/set/1/tile/0/0/duration", &[OscType::Float(10.0)]);
        b.apply_message("/set/1/tile/0/0/remainingTime", &[OscType::Float(8.0)]);
        assert!(b.has_any_playing());
        b.apply_message("/set/1/tile/0/0/remainingTime", &[OscType::Float(10.0)]);
        assert!(!b.has_any_playing());
    }

    #[test]
    fn apply_notes() {
        let mut b = FarragoBoard::default();
        b.apply_message(
            "/set/0/tile/0/0/notes",
            &[OscType::String("some notes".into())],
        );
        let snap = b.snapshot();
        assert_eq!(snap.sets[0].tiles[0].notes.as_deref(), Some("some notes"));
    }
}
