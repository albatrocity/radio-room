//! Active-segment payload returned by the platform device API.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentActivated {
    pub room_id: String,
    #[allow(dead_code)]
    pub show_id: String,
    pub segment_id: String,
    #[allow(dead_code)]
    pub segment_title: String,
}

impl SegmentActivated {
    pub fn from_json(s: &str) -> serde_json::Result<Self> {
        serde_json::from_str(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_segment_activated() {
        let j = r#"{"roomId":"r1","showId":"s1","segmentId":"4","segmentTitle":"Break"}"#;
        let p = SegmentActivated::from_json(j).unwrap();
        assert_eq!(p.room_id, "r1");
        assert_eq!(p.segment_id, "4");
    }
}
