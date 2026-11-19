use crate::config::Config;
use crate::events::SegmentActivated;
use crate::osc_send::args_for_osc_address;
use rosc::OscType;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentCue {
    /// Join / reconnect push. Do not replay a theme the Mac already played.
    Snapshot,
    /// Someone activated a segment, including a repeat of the one already on.
    Activation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OscSkip {
    Empty,
    RoomMismatch,
    OscDisabled,
    Unmapped,
}

/// Tag on the socket payload wins. Untagged events use the join heuristic:
/// the first push after `watch` is the snapshot.
pub fn segment_cue_from_label(label: Option<&str>, first_after_watch: bool) -> SegmentCue {
    match label {
        Some("snapshot") => SegmentCue::Snapshot,
        Some("activation") => SegmentCue::Activation,
        _ if first_after_watch => SegmentCue::Snapshot,
        _ => SegmentCue::Activation,
    }
}

/// Snapshot plays only when the segment id changed. An activation always plays.
pub fn should_fire_segment_osc(
    previous_segment_id: Option<&str>,
    segment_id: &str,
    cue: SegmentCue,
) -> bool {
    if segment_id.is_empty() {
        return false;
    }
    match cue {
        SegmentCue::Activation => true,
        SegmentCue::Snapshot => previous_segment_id != Some(segment_id),
    }
}

pub fn osc_for_segment_ids(
    cfg: &Config,
    room_id: &str,
    segment_id: &str,
) -> Result<(String, Vec<OscType>), OscSkip> {
    if segment_id.is_empty() {
        return Err(OscSkip::Empty);
    }
    if !cfg.room_id.is_empty() && cfg.room_id != room_id {
        return Err(OscSkip::RoomMismatch);
    }
    if !cfg.features.osc.enabled {
        return Err(OscSkip::OscDisabled);
    }
    let Some(addr) = cfg.features.osc.segment_map.get(segment_id).cloned() else {
        return Err(OscSkip::Unmapped);
    };
    let args = args_for_osc_address(&addr, &cfg.features.osc.default_args);
    Ok((addr, args))
}

/// If this active-segment payload should trigger an OSC send, return `(address, args)`.
pub fn osc_action_for_segment(
    cfg: &Config,
    payload: &str,
) -> Option<(String, Vec<OscType>)> {
    let seg = SegmentActivated::from_json(payload).ok()?;
    osc_for_segment_ids(cfg, &seg.room_id, &seg.segment_id).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segment_map_match() {
        let mut cfg = Config::default();
        cfg.room_id = "room-a".to_string();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 9000;
        cfg.features.osc.segment_map.insert(
            "4".to_string(),
            "/set/selected/tile/0/0/play".to_string(),
        );
        cfg.features.osc.default_args = vec![1.0];
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        let a = osc_action_for_segment(&cfg, payload);
        let (path, args) = a.expect("some");
        assert_eq!(path, "/set/selected/tile/0/0/play");
        assert_eq!(args, vec![OscType::Int(1)]);
    }

    #[test]
    fn play_sends_integer_one_when_default_args_empty() {
        let mut cfg = Config::default();
        cfg.room_id = "room-a".to_string();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 8090;
        cfg.features.osc.segment_map.insert(
            "4".to_string(),
            "/set/0/tile/0/4/play".to_string(),
        );
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        let (_path, args) = osc_action_for_segment(&cfg, payload).expect("some");
        assert_eq!(args, vec![OscType::Int(1)]);
    }

    #[test]
    fn volume_path_stays_float() {
        let mut cfg = Config::default();
        cfg.room_id = "room-a".to_string();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 8090;
        cfg.features.osc.default_args = vec![0.4];
        cfg.features.osc.segment_map.insert(
            "4".to_string(),
            "/set/0/tile/0/4/volume".to_string(),
        );
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        let (_path, args) = osc_action_for_segment(&cfg, payload).expect("some");
        assert_eq!(args, vec![OscType::Float(0.4)]);
    }

    #[test]
    fn activation_replays_the_segment_already_on() {
        assert!(should_fire_segment_osc(
            Some("4"),
            "4",
            SegmentCue::Activation
        ));
    }

    #[test]
    fn snapshot_does_not_replay_the_same_segment() {
        assert!(!should_fire_segment_osc(
            Some("4"),
            "4",
            SegmentCue::Snapshot
        ));
        assert!(should_fire_segment_osc(None, "4", SegmentCue::Snapshot));
        assert!(should_fire_segment_osc(
            Some("3"),
            "4",
            SegmentCue::Snapshot
        ));
    }

    #[test]
    fn untagged_join_is_a_snapshot_and_later_events_activate() {
        assert_eq!(
            segment_cue_from_label(None, true),
            SegmentCue::Snapshot
        );
        assert_eq!(
            segment_cue_from_label(None, false),
            SegmentCue::Activation
        );
        assert_eq!(
            segment_cue_from_label(Some("activation"), true),
            SegmentCue::Activation
        );
    }

    #[test]
    fn wrong_room_no_action() {
        let mut cfg = Config::default();
        cfg.room_id = "other".to_string();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 1;
        cfg.features.osc.segment_map.insert(
            "4".to_string(),
            "/play".to_string(),
        );
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        assert!(osc_action_for_segment(&cfg, payload).is_none());
    }

    #[test]
    fn empty_room_listens_all() {
        let mut cfg = Config::default();
        cfg.room_id = String::new();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 1;
        cfg.features.osc
            .segment_map
            .insert("4".to_string(), "/test".to_string());
        let payload = r#"{"roomId":"any","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        assert!(osc_action_for_segment(&cfg, payload).is_some());
    }
}

#[cfg(test)]
mod config_tests {
    use super::Config;

    #[test]
    fn validate_rejects_bad_osc_path() {
        let mut cfg = Config::default();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 8000;
        cfg.features
            .osc
            .segment_map
            .insert("1".to_string(), "no-leading-slash".to_string());
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_soundboard_requires_osc() {
        let mut cfg = Config::default();
        cfg.features.soundboard.enabled = true;
        cfg.features.soundboard.osc_listen_port = 9877;
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_soundboard_ok_when_osc_enabled() {
        let mut cfg = Config::default();
        cfg.features.osc.enabled = true;
        cfg.features.osc.port = 8000;
        cfg.features.soundboard.enabled = true;
        cfg.features.soundboard.osc_listen_port = 9877;
        assert!(cfg.validate().is_ok());
    }
}
