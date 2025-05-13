import internetradio from "node-internet-radio";
import { Station } from "../types/Station";
import { ERROR_STATION_FETCH_FAILED } from "../lib/constants";
import { StationProtocol } from "../types/StationProtocol";

function getProtocol(protocol: StationProtocol) {
  switch (protocol) {
    case "shoutcastv1":
      return internetradio.StreamSource.SHOUTCAST_V1;
    case "shoutcastv2":
      return internetradio.StreamSource.SHOUTCAST_V2;
    case "icecast":
      return internetradio.StreamSource.ICECAST;
    case "raw":
      return internetradio.StreamSource.STREAM;
    default:
      return internetradio.StreamSource.SHOUTCAST_V2;
  }
}

const getStation = async (
  url: string,
  protocol: StationProtocol = "shoutcastv2",
): Promise<Station> => {
  const streamProtocol = getProtocol(protocol);

  return new Promise((resolve, reject) => {
    internetradio.getStationInfo(
      url,
      (error: any, station: Station) => {
        if (error) {
          return reject(new Error(ERROR_STATION_FETCH_FAILED));
        }
        return resolve(station);
      },
      streamProtocol,
    );
  });
};

export default getStation;
