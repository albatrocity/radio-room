use crate::config::Config;
use crate::events::{event_name_from_channel, SegmentActivated};
use crate::osc_send::default_args_to_osc;
use rosc::OscType;

/// If this `SYSTEM:*` message should trigger an OSC send, return `(address, args)`.
pub fn osc_action_for_system_message(
    cfg: &Config,
    channel: &str,
    payload: &str,
) -> Option<(String, Vec<OscType>)> {
    let event = event_name_from_channel(channel)?;
    if event != "SEGMENT_ACTIVATED" {
        return None;
    }
    let seg = SegmentActivated::from_json(payload).ok()?;
    if !cfg.room_id.is_empty() && cfg.room_id != seg.room_id {
        return None;
    }
    if !cfg.features.osc.enabled {
        return None;
    }
    let addr = cfg
        .features
        .osc
        .segment_map
        .get(&seg.segment_id)
        .cloned()?;
    let args = default_args_to_osc(&cfg.features.osc.default_args);
    Some((addr, args))
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
        let ch = "SYSTEM:SEGMENT_ACTIVATED";
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        let a = osc_action_for_system_message(&cfg, ch, payload);
        let (path, args) = a.expect("some");
        assert_eq!(path, "/set/selected/tile/0/0/play");
        assert_eq!(args.len(), 1);
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
        let ch = "SYSTEM:SEGMENT_ACTIVATED";
        let payload = r#"{"roomId":"room-a","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        assert!(osc_action_for_system_message(&cfg, ch, payload).is_none());
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
        let ch = "SYSTEM:SEGMENT_ACTIVATED";
        let payload = r#"{"roomId":"any","showId":"s","segmentId":"4","segmentTitle":"x"}"#;
        assert!(osc_action_for_system_message(&cfg, ch, payload).is_some());
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
    fn validate_accepts_rediss_url() {
        let mut cfg = Config::default();
        cfg.redis_url = "rediss://:secret@example.com:6380".to_string();
        assert!(cfg.validate().is_ok());
    }

    #[test]
    fn validate_accepts_rediss_insecure_fragment() {
        let mut cfg = Config::default();
        cfg.redis_url = "rediss://:secret@example.com:6380/#insecure".to_string();
        assert!(cfg.validate().is_ok());
    }
}
