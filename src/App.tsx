import { Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, OrbitControls, useGLTF } from '@react-three/drei';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

type Coordinates = [number, number];
type TransportMode = 'drive' | 'bike' | 'walk';

type Place = {
  id: string;
  name: string;
  address: string;
  province?: string;
  category: string;
  description: string;
  position: Coordinates;
  speedLimit: number;
  etaLabel: string;
  level?: 'ward' | 'province';
  sourceFile?: string;
};

type RouteInfo = {
  originLabel: string;
  destinationLabel: string;
  path: Coordinates[];
  distanceInMeters: number;
  durationInMinutes: number;
  steps: string[];
  transportMode: TransportMode;
};

type FocusRequest = {
  id: number;
  location: Coordinates;
  zoom: number;
};

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type GeoJsonFeature = {
  type: 'Feature';
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features?: GeoJsonFeature[];
};

type OsrmStep = {
  distance?: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
  };
};

type OsrmLeg = {
  steps?: OsrmStep[];
};

type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: {
    coordinates?: [number, number][];
  };
  legs?: OsrmLeg[];
};

type OsrmRouteResponse = {
  code?: string;
  routes?: OsrmRoute[];
};

const DEFAULT_CENTER: Coordinates = [10.7769, 106.7009];
const DEFAULT_ZOOM = 14;
const PLACE_DATA_SOURCES = ['/data/destination-index.json', '/data/vn.json', '/data/map.geojson'];
const OSRM_ROUTE_BASE_URL = 'https://router.project-osrm.org/route/v1';
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
const MAPBOX_STYLE_ID = import.meta.env.VITE_MAPBOX_STYLE_ID?.trim() || 'mapbox/navigation-day-v1';
const MAPBOX_TILE_URL = MAPBOX_ACCESS_TOKEN
  ? `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`
  : null;
const GEOJSON_NAME_KEYS = [
  'name',
  'Name',
  'NAME',
  'NAME_1',
  'NAME_2',
  'TEN',
  'ten',
  'province',
  'district',
  'ward',
  'city',
  'title',
  'label',
];
const GEOJSON_ADDRESS_KEYS = [
  'address',
  'Address',
  'full_name',
  'description',
  'province',
  'district',
  'ward',
  'city',
  'NAME_1',
  'NAME_2',
];
const GEOJSON_CATEGORY_KEYS = ['category', 'type', 'TYPE', 'kind', 'layer', 'admin_level', 'fclass'];
const GEOJSON_SPEED_KEYS = ['speed_limit', 'speedLimit', 'maxspeed', 'speed'];

const previewBuildings = [
  { position: [-2.8, 0.85, -0.5] as [number, number, number], height: 1.7, color: '#8aa4b8' },
  { position: [-1.2, 1.15, 1.2] as [number, number, number], height: 2.3, color: '#5d7b93' },
  { position: [1.5, 0.7, -1.4] as [number, number, number], height: 1.4, color: '#aec2d1' },
  { position: [3.0, 1.35, 0.7] as [number, number, number], height: 2.7, color: '#6e8aa0' },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function collectLngLatPairs(value: unknown, pairs: [number, number][] = []) {
  if (!Array.isArray(value)) {
    return pairs;
  }

  if (
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  ) {
    pairs.push([value[0], value[1]]);
    return pairs;
  }

  value.forEach((entry) => {
    collectLngLatPairs(entry, pairs);
  });

  return pairs;
}

function getRepresentativePosition(geometry: GeoJsonGeometry | null | undefined): Coordinates | null {
  if (!geometry) {
    return null;
  }

  const pairs = collectLngLatPairs(geometry.coordinates);
  if (pairs.length === 0) {
    return null;
  }

  const [totalLongitude, totalLatitude] = pairs.reduce(
    (totals, [longitude, latitude]) => [totals[0] + longitude, totals[1] + latitude],
    [0, 0]
  );

  return [totalLatitude / pairs.length, totalLongitude / pairs.length];
}

function getStringProperty(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumberProperty(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function toPlaceId(source: string, index: number) {
  const normalized = source
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized ? `${normalized}-${index}` : `geojson-place-${index}`;
}

function parseGeoJsonPlaces(data: GeoJsonFeatureCollection): Place[] {
  const features = Array.isArray(data.features) ? data.features : [];

  return features.flatMap((feature, index) => {
    const properties = feature.properties ?? {};
    const position = getRepresentativePosition(feature.geometry);

    if (!position) {
      return [];
    }

    const name =
      getStringProperty(properties, GEOJSON_NAME_KEYS) ??
      `Địa điểm Việt Nam ${index + 1}`;
    const address =
      getStringProperty(properties, GEOJSON_ADDRESS_KEYS) ??
      name;
    const category =
      getStringProperty(properties, GEOJSON_CATEGORY_KEYS) ??
      feature.geometry?.type ??
      'GeoJSON';
    const speedLimit = Math.max(20, Math.min(120, Math.round(getNumberProperty(properties, GEOJSON_SPEED_KEYS) ?? 50)));

    return [
      {
        id: String(feature.id ?? toPlaceId(name, index)),
        name,
        address,
        province: typeof properties.ten_tinh === 'string' ? properties.ten_tinh : undefined,
        category,
        description: `Dữ liệu vị trí lấy từ GeoJSON Việt Nam (${feature.geometry?.type ?? 'geometry'}).`,
        position,
        speedLimit,
        etaLabel: 'Nguồn GeoJSON Việt Nam',
        level: typeof properties.ten_xa === 'string' ? 'ward' : 'province',
      },
    ];
  });
}

function readStoredSpeedLimit() {
  try {
    const saved = window.localStorage.getItem('speedLimit');
    const parsed = saved ? Number(saved) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 50;
  } catch {
    return 50;
  }
}

function persistSpeedLimit(value: number) {
  try {
    window.localStorage.setItem('speedLimit', String(value));
  } catch {
    // Ignore storage failures so the app can still render normally.
  }
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getSearchScore(place: Place, query: string) {
  const normalizedName = normalizeSearchText(place.name);
  const normalizedAddress = normalizeSearchText(place.address);
  const normalizedProvince = normalizeSearchText(place.province ?? '');

  let score = 0;

  if (normalizedName === query) {
    score += 200;
  } else if (normalizedName.startsWith(query)) {
    score += 120;
  } else if (normalizedName.includes(query)) {
    score += 80;
  }

  if (normalizedAddress.startsWith(query)) {
    score += 70;
  } else if (normalizedAddress.includes(query)) {
    score += 45;
  }

  if (normalizedProvince === query) {
    score += 30;
  } else if (normalizedProvince.startsWith(query)) {
    score += 18;
  }

  if (place.level === 'ward') {
    score += 12;
  }

  return score;
}

const transportLabels: Record<TransportMode, string> = {
  drive: 'Ô tô',
  bike: 'Xe máy',
  walk: 'Đi bộ',
};

const transportProfiles: Record<TransportMode, string> = {
  drive: 'driving',
  bike: 'driving',
  walk: 'foot',
};

const placePinIcon = L.divIcon({
  className: 'map-pin map-pin--place',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -20],
});

const activePlacePinIcon = L.divIcon({
  className: 'map-pin map-pin--active',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

function CarModel({ speedLimit }: { speedLimit: number }) {
  const { scene } = useGLTF('/models/car_3d.glb');
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (speedLimit / 45);
    }
  });

  return (
    <group ref={groupRef} rotation={[0.15, 0.6, 0]}>
      <primitive object={scene} scale={[0.01, 0.01, 0.01]} position={[0, -0.8, 0]} />
    </group>
  );
}

function BuildingModel({
  position,
  height,
  color,
}: {
  position: [number, number, number];
  height: number;
  color: string;
}) {
  return (
    <Box args={[0.9, height, 0.9]} position={position}>
      <meshStandardMaterial color={color} />
    </Box>
  );
}

function PreviewFallbackCar() {
  return (
    <Box args={[2.2, 0.6, 1.1]} position={[0, 0, 0]}>
      <meshStandardMaterial color="#1570ef" />
    </Box>
  );
}

function TrafficPreview3D({
  speedLimit,
  currentSpeed,
}: {
  speedLimit: number;
  currentSpeed: number;
}) {
  return (
    <div className="traffic-preview">
      <div className="traffic-preview__meta">
        <div>
          <span className="eyebrow">3D traffic</span>
          <strong>Mô phỏng xe di chuyển</strong>
        </div>
        <span className={`pill ${currentSpeed > speedLimit ? 'pill--warn' : 'pill--ok'}`}>
          {currentSpeed > speedLimit ? 'Vượt ngưỡng' : 'Ổn định'}
        </span>
      </div>
      <Canvas camera={{ position: [0, 3.5, 7], fov: 45 }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <pointLight position={[-4, 3, 4]} intensity={0.7} color="#f97316" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#e7edf3" />
        </mesh>
        {previewBuildings.map((building) => (
          <BuildingModel
            key={building.position.join('-')}
            position={building.position}
            height={building.height}
            color={building.color}
          />
        ))}
        <Suspense fallback={<PreviewFallbackCar />}>
          <CarModel speedLimit={speedLimit} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
      </Canvas>
    </div>
  );
}

function formatDistance(distanceInMeters: number) {
  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }

  return `${(distanceInMeters / 1000).toFixed(distanceInMeters >= 10000 ? 1 : 2)} km`;
}

function toKilometersPerHour(speedInMetersPerSecond: number) {
  return Math.max(0, speedInMetersPerSecond * 3.6);
}

function calculateDistanceInMeters([prevLat, prevLng]: Coordinates, [nextLat, nextLng]: Coordinates) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(nextLat - prevLat);
  const deltaLng = toRadians(nextLng - prevLng);
  const lat1 = toRadians(prevLat);
  const lat2 = toRadians(nextLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStepAction(step: OsrmStep) {
  const type = step.maneuver?.type ?? '';
  const modifier = step.maneuver?.modifier ?? '';

  if (type === 'depart') {
    return 'Xuất phát';
  }

  if (type === 'arrive') {
    return 'Đến nơi';
  }

  if (type === 'roundabout') {
    return 'Đi qua vòng xoay';
  }

  if (type === 'merge') {
    return 'Nhập vào tuyến đường';
  }

  if (type === 'fork') {
    return 'Đi theo nhánh đường';
  }

  if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') {
    return 'Rẽ trái';
  }

  if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') {
    return 'Rẽ phải';
  }

  if (modifier === 'uturn') {
    return 'Quay đầu';
  }

  return 'Đi thẳng';
}

function formatRouteSteps(legs: OsrmLeg[] | undefined, destinationLabel: string) {
  const steps = (legs ?? [])
    .flatMap((leg) => leg.steps ?? [])
    .filter((step) => (step.distance ?? 0) > 0)
    .map((step) => {
      const roadName = step.name?.trim() ? ` vào ${step.name.trim()}` : '';
      return `${getStepAction(step)}${roadName} khoảng ${formatDistance(step.distance ?? 0)}.`;
    });

  if (steps.length === 0) {
    return [`Di chuyển theo tuyến đường hiện có để đến ${destinationLabel}.`];
  }

  const lastIndex = steps.length - 1;
  steps[lastIndex] = `Tiếp tục theo tuyến đường hiện có để đến ${destinationLabel}.`;
  return steps;
}

async function fetchRoadRoute(
  start: Coordinates,
  end: Coordinates,
  transportMode: TransportMode,
  originLabel: string,
  destinationLabel: string
): Promise<RouteInfo> {
  const profile = transportProfiles[transportMode];
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const requestUrl =
    `${OSRM_ROUTE_BASE_URL}/${profile}/${coordinates}` +
    '?overview=full&geometries=geojson&steps=true&alternatives=false&annotations=false';

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error('Không thể kết nối dịch vụ tìm đường.');
  }

  const data = (await response.json()) as OsrmRouteResponse;
  const route = data.routes?.[0];
  const geometryCoordinates = route?.geometry?.coordinates ?? [];
  const path = geometryCoordinates.map(([longitude, latitude]) => [latitude, longitude] as Coordinates);

  if (data.code !== 'Ok' || path.length < 2 || typeof route?.distance !== 'number' || typeof route?.duration !== 'number') {
    throw new Error('Không tìm thấy tuyến đường phù hợp trên mạng đường hiện có.');
  }

  return {
    originLabel,
    destinationLabel,
    path,
    distanceInMeters: route.distance,
    durationInMinutes: Math.max(1, Math.round(route.duration / 60)),
    steps: formatRouteSteps(route.legs, destinationLabel),
    transportMode,
  };
}

function MapViewportController({
  focusRequest,
  routePath,
}: {
  focusRequest: FocusRequest | null;
  routePath: Coordinates[];
}) {
  const map = useMap();

  useEffect(() => {
    if (routePath.length > 1) {
      map.fitBounds(routePath, {
        padding: [56, 56],
      });
      return;
    }

    if (focusRequest) {
      map.flyTo(focusRequest.location, focusRequest.zoom, {
        duration: 1.2,
      });
    }
  }, [map, focusRequest, routePath]);

  return null;
}

function LocateControl({ onLocate }: { onLocate: () => void }) {
  const map = useMap();

  useEffect(() => {
    const LocateControlClass = L.Control.extend({
      options: {
        position: 'bottomright',
      },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-locate-control');
        const button = L.DomUtil.create('button', 'map-locate-control__button', container);
        button.type = 'button';
        button.innerHTML = '◎';
        button.setAttribute('aria-label', 'Vị trí của tôi');

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, 'click', (event: Event) => {
          L.DomEvent.stop(event);
          onLocate();
        });

        return container;
      },
    });

    const locateControl = new LocateControlClass();
    locateControl.addTo(map);

    return () => {
      map.removeControl(locateControl);
    };
  }, [map, onLocate]);

  return null;
}

function MapSurface({
  places,
  selectedPlaceId,
  currentLocation,
  routePath,
  focusRequest,
  onSelectPlace,
  onLocate,
  onMapLoad,
}: {
  places: Place[];
  selectedPlaceId: string | null;
  currentLocation: Coordinates | null;
  routePath: Coordinates[];
  focusRequest: FocusRequest | null;
  onSelectPlace: (place: Place) => void;
  onLocate: () => void;
  onMapLoad: () => void;
}) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      className="map-surface"
      whenReady={onMapLoad}
    >
      {MAPBOX_TILE_URL ? (
        <TileLayer
          url={MAPBOX_TILE_URL}
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; OpenStreetMap contributors'
          tileSize={512}
          zoomOffset={-1}
          maxZoom={22}
        />
      ) : (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={20}
        />
      )}
      <ZoomControl position="bottomright" />
      <LocateControl onLocate={onLocate} />
      <MapViewportController focusRequest={focusRequest} routePath={routePath} />

      {places.map((place) => (
        <Marker
          key={place.id}
          position={place.position}
          icon={place.id === selectedPlaceId ? activePlacePinIcon : placePinIcon}
          eventHandlers={{
            click: () => onSelectPlace(place),
          }}
        >
          <Popup>
            <strong>{place.name}</strong>
            <br />
            {place.address}
            <br />
            Giới hạn tham chiếu: {place.speedLimit} km/h
          </Popup>
        </Marker>
      ))}

      {currentLocation && (
        <CircleMarker center={currentLocation} radius={10} pathOptions={{ color: '#1570ef', weight: 3 }}>
          <Popup>Vị trí hiện tại của bạn</Popup>
        </CircleMarker>
      )}

      {routePath.length > 1 && (
        <Polyline
          positions={routePath}
          pathOptions={{
            color: '#1570ef',
            weight: 6,
            opacity: 0.95,
            lineCap: 'round',
            dashArray: '10 12',
          }}
        />
      )}
    </MapContainer>
  );
}

function App() {
  const [speedLimit, setSpeedLimit] = useState(readStoredSpeedLimit);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesSource, setPlacesSource] = useState<string | null>(null);
  const [isPlacesLoading, setIsPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [warning, setWarning] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>('drive');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [originValue, setOriginValue] = useState('current');
  const [destinationValue, setDestinationValue] = useState('');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);
  const routeRequestIdRef = useRef(0);

  useEffect(() => {
    setWarning(currentSpeed > speedLimit);
  }, [currentSpeed, speedLimit]);

  useEffect(() => {
    persistSpeedLimit(speedLimit);
  }, [speedLimit]);

  useEffect(() => {
    let isDisposed = false;

    const loadPlaces = async () => {
      setIsPlacesLoading(true);
      setPlacesError(null);
      setPlacesSource(null);

      try {
        let loadedSource: string | null = null;
        let data: GeoJsonFeatureCollection | Place[] | null = null;

        for (const source of PLACE_DATA_SOURCES) {
          const response = await fetch(source);
          if (!response.ok) {
            continue;
          }

          data = (await response.json()) as GeoJsonFeatureCollection;
          loadedSource = source;
          break;
        }

        if (!data || !loadedSource) {
          throw new Error('Không thể tải dữ liệu GeoJSON.');
        }

        const nextPlaces = Array.isArray(data)
          ? (data as Place[])
          : parseGeoJsonPlaces(data);

        if (isDisposed) {
          return;
        }

        setPlaces(nextPlaces);
        setPlacesSource(loadedSource);
        if (nextPlaces.length === 0) {
          setPlacesError(`${loadedSource} hiện chưa có feature vị trí nào để hiển thị.`);
        }
      } catch {
        if (isDisposed) {
          return;
        }

        setPlaces([]);
        setPlacesSource(null);
        setPlacesError('Không đọc được dữ liệu từ /data/destination-index.json, /data/vn.json hoặc /data/map.geojson.');
      } finally {
        if (!isDisposed) {
          setIsPlacesLoading(false);
        }
      }
    };

    void loadPlaces();

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation: Coordinates = [position.coords.latitude, position.coords.longitude];
        setCurrentLocation(newLocation);
        setGpsAccuracy(Math.round(position.coords.accuracy));
        lastPositionRef.current = position;
        setFocusRequest((previousValue) =>
          previousValue ?? {
            id: Date.now(),
            location: newLocation,
            zoom: 15,
          }
        );
      },
      () => {
        setFocusRequest({
          id: Date.now(),
          location: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 300000,
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (places.length === 0) {
      setSelectedPlace(null);
      setDestinationValue('');
      setRouteInfo(null);
      setOriginValue('current');
      return;
    }

    setSelectedPlace((previousValue) => {
      if (!previousValue) {
        return places[0];
      }

      return places.find((place) => place.id === previousValue.id) ?? places[0];
    });

    setOriginValue((previousValue) =>
      previousValue === 'current' || places.some((place) => place.id === previousValue)
        ? previousValue
        : 'current'
    );
  }, [places]);

  useEffect(() => {
    if (selectedPlace) {
      setDestinationValue(selectedPlace.id);
      return;
    }

    setDestinationValue('');
  }, [selectedPlace]);

  useEffect(() => {
    if (!currentLocation && !focusRequest && places.length > 0) {
      setFocusRequest({
        id: Date.now(),
        location: places[0].position,
        zoom: 7,
      });
    }
  }, [currentLocation, focusRequest, places]);

  const searchableText = normalizeSearchText(deferredSearchQuery);
  const searchResults = searchableText
    ? places
        .filter((place) =>
          [place.name, place.address, place.category, place.description, place.province ?? ''].some((value) =>
            normalizeSearchText(value).includes(searchableText)
          )
        )
        .sort((left, right) => getSearchScore(right, searchableText) - getSearchScore(left, searchableText))
        .slice(0, 8)
    : [];

  const nearbyPlaces = [...places]
    .sort((placeA, placeB) => {
      const from = currentLocation ?? DEFAULT_CENTER;
      return (
        calculateDistanceInMeters(from, placeA.position) - calculateDistanceInMeters(from, placeB.position)
      );
    })
    .slice(0, 4);

  const selectedOriginPlace = originValue === 'current' ? null : places.find((place) => place.id === originValue) ?? null;

  const visiblePlaces = (() => {
    const placeMap = new Map<string, Place>();

    if (selectedPlace) {
      placeMap.set(selectedPlace.id, selectedPlace);
    }

    if (selectedOriginPlace) {
      placeMap.set(selectedOriginPlace.id, selectedOriginPlace);
    }

    searchResults.slice(0, 5).forEach((place) => {
      placeMap.set(place.id, place);
    });

    nearbyPlaces.forEach((place) => {
      placeMap.set(place.id, place);
    });

    return [...placeMap.values()];
  })();

  const updateSpeedFromPosition = (position: GeolocationPosition, trackingEnabled = false) => {
    const { coords, timestamp } = position;
    const fallbackFromMovement = (() => {
      const previousPosition = lastPositionRef.current;

      if (!previousPosition) {
        return 0;
      }

      const elapsedSeconds = (timestamp - previousPosition.timestamp) / 1000;
      if (elapsedSeconds <= 0) {
        return currentSpeed;
      }

      const distanceInMeters = calculateDistanceInMeters(
        [previousPosition.coords.latitude, previousPosition.coords.longitude],
        [coords.latitude, coords.longitude]
      );

      return toKilometersPerHour(distanceInMeters / elapsedSeconds);
    })();

    const speedInKilometersPerHour =
      typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed >= 0
        ? toKilometersPerHour(coords.speed)
        : fallbackFromMovement;

    const nextLocation: Coordinates = [coords.latitude, coords.longitude];
    setCurrentLocation(nextLocation);
    setCurrentSpeed(Math.round(Math.min(speedInKilometersPerHour, 250)));
    setGpsAccuracy(Math.round(coords.accuracy));
    setGpsEnabled(trackingEnabled);
    lastPositionRef.current = position;
  };

  const requestCurrentLocation = (shouldFocus = true) => {
    if (!navigator.geolocation) {
      window.alert('Trình duyệt hiện tại không hỗ trợ định vị.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateSpeedFromPosition(position, false);
        if (shouldFocus) {
          setFocusRequest({
            id: Date.now(),
            location: [position.coords.latitude, position.coords.longitude],
            zoom: 17,
          });
        }
      },
      () => {
        window.alert('Không thể lấy vị trí hiện tại. Vui lòng kiểm tra quyền truy cập vị trí.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const enableGPS = async () => {
    if (!navigator.geolocation) {
      window.alert('Trình duyệt không hỗ trợ GPS.');
      return;
    }

    setIsLoading(true);

    try {
      const initialPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      updateSpeedFromPosition(initialPosition, true);
      setFocusRequest({
        id: Date.now(),
        location: [initialPosition.coords.latitude, initialPosition.coords.longitude],
        zoom: 17,
      });

      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }

      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          updateSpeedFromPosition(position, true);
        },
        () => {
          if (gpsWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchIdRef.current);
            gpsWatchIdRef.current = null;
          }

          setGpsEnabled(false);
          setGpsAccuracy(null);
          window.alert('GPS bị gián đoạn. Vui lòng kiểm tra tín hiệu hoặc quyền truy cập vị trí.');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } catch {
      setGpsEnabled(false);
      setGpsAccuracy(null);
      window.alert('Không thể truy cập GPS. Vui lòng kiểm tra quyền truy cập vị trí.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectPlace = (place: Place) => {
    routeRequestIdRef.current += 1;
    setSelectedPlace(place);
    setDestinationValue(place.id);
    setSearchQuery(place.name);
    setSearchOpen(false);
    setRouteInfo(null);
    setRouteError(null);
    setIsRouteLoading(false);
    setFocusRequest({
      id: Date.now(),
      location: place.position,
      zoom: 16,
    });
  };

  const clearRoute = () => {
    routeRequestIdRef.current += 1;
    setRouteInfo(null);
    setRouteError(null);
    setIsRouteLoading(false);
    if (selectedPlace) {
      setFocusRequest({
        id: Date.now(),
        location: selectedPlace.position,
        zoom: 16,
      });
    }
  };

  const buildRoute = async (destinationOverrideId?: string) => {
    const destination = places.find((place) => place.id === (destinationOverrideId ?? destinationValue));
    if (!destination) {
      return;
    }

    const originPlace = originValue === 'current' ? null : places.find((place) => place.id === originValue);
    const originLocation = originValue === 'current' ? currentLocation : originPlace?.position;

    if (!originLocation) {
      window.alert('Cần bật vị trí hiện tại hoặc chọn một điểm xuất phát khác.');
      return;
    }

    if (originPlace && originPlace.id === destination.id) {
      window.alert('Điểm đi và điểm đến đang trùng nhau.');
      return;
    }

    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    setIsRouteLoading(true);
    setRouteError(null);

    try {
      const nextRoute = await fetchRoadRoute(
        originLocation,
        destination.position,
        transportMode,
        originValue === 'current' ? 'Vị trí hiện tại' : originPlace?.name ?? 'Điểm đi',
        destination.name
      );

      if (routeRequestIdRef.current !== requestId) {
        return;
      }

      setSelectedPlace(destination);
      setRouteInfo(nextRoute);
    } catch (error) {
      if (routeRequestIdRef.current !== requestId) {
        return;
      }

      setRouteInfo(null);
      setRouteError(error instanceof Error ? error.message : 'Không thể tìm đường theo mạng đường hiện có.');
    } finally {
      if (routeRequestIdRef.current === requestId) {
        setIsRouteLoading(false);
      }
    }
  };

  const hasPlaces = places.length > 0;
  const searchEmpty = searchOpen && searchableText.length > 0 && searchResults.length === 0 && !isPlacesLoading;

  return (
    <div className="app-shell">
      <div className="map-stage">
        <MapSurface
          places={visiblePlaces}
          selectedPlaceId={selectedPlace?.id ?? null}
          currentLocation={currentLocation}
          routePath={routeInfo?.path ?? []}
          focusRequest={focusRequest}
          onSelectPlace={selectPlace}
          onLocate={() => requestCurrentLocation(true)}
          onMapLoad={() => setMapLoaded(true)}
        />

        <div className={`map-topbar ${isPanelCollapsed ? 'map-topbar--with-dock' : ''}`}>
          <div className="search-surface">
            <div className="search-row">
              <span className="search-row__icon">⌕</span>
              <input
                type="text"
                value={searchQuery}
                placeholder="Tìm địa điểm, địa chỉ hoặc khu vực"
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              />
              {searchQuery && (
                <button className="icon-button" type="button" onClick={() => setSearchQuery('')}>
                  ×
                </button>
              )}
              <button className="icon-button icon-button--primary" type="button" onClick={() => requestCurrentLocation(true)}>
                ◎
              </button>
            </div>

            {searchOpen && searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    className="search-result"
                    onMouseDown={() => selectPlace(place)}
                  >
                    <span className="search-result__name">{place.name}</span>
                    <span className="search-result__meta">
                      {place.category} · {place.address}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {searchEmpty && <div className="search-empty">Không có tỉnh hoặc phường/xã nào khớp từ khóa này.</div>}

            <div className="quick-actions">
              {nearbyPlaces.length > 0 ? (
                nearbyPlaces.map((place) => (
                  <button key={place.id} type="button" className="quick-chip" onClick={() => selectPlace(place)}>
                    {place.name}
                  </button>
                ))
              ) : (
                <div className="quick-empty">
                  {isPlacesLoading ? 'Đang đọc dữ liệu địa chỉ...' : 'Chưa có dữ liệu địa chỉ để gợi ý.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {isPanelCollapsed && (
          <div className={`speed-dock ${warning ? 'speed-dock--warn' : ''}`}>
            <button
              type="button"
              className="speed-dock__toggle"
              onClick={() => setIsPanelCollapsed(false)}
              aria-label="Mở bảng điều khiển"
            >
              ‹
            </button>
            <div className="speed-dock__metrics" aria-label={`Tốc độ hiện tại ${currentSpeed}, giới hạn ${speedLimit}`}>
              <strong className={warning ? 'speed-dock__number speed-dock__number--warn' : 'speed-dock__number'}>
                {currentSpeed}
              </strong>
              <span className="speed-dock__divider">/</span>
              <strong className="speed-dock__number speed-dock__number--limit">{speedLimit}</strong>
            </div>
          </div>
        )}

        {!isPanelCollapsed && (
        <aside className="map-panel">
          <div className="map-panel__controls">
            <button
              type="button"
              className="panel-toggle"
              onClick={() => setIsPanelCollapsed(true)}
              aria-label="Thu gọn bảng điều khiển"
            >
              Thu gọn
            </button>
          </div>
          <section className="panel-section panel-section--hero">
            <div>
              <span className="eyebrow">Live map</span>
              <h1>Điều hướng, tìm vị trí và theo dõi tốc độ trên cùng một màn hình.</h1>
              <p>
                Giao diện được sắp theo kiểu ứng dụng bản đồ: tìm kiếm nhanh, chọn lộ trình, xem
                vị trí hiện tại và điều chỉnh trải nghiệm tốt trên mobile lẫn tablet.
              </p>
            </div>
            <div className="status-grid">
              <div className="status-card">
                <span>Bản đồ</span>
                <strong>{mapLoaded ? 'Sẵn sàng' : 'Đang tải'}</strong>
              </div>
              <div className="status-card">
                <span>GPS</span>
                <strong>{gpsEnabled ? 'Đang theo dõi' : currentLocation ? 'Có vị trí' : 'Chưa bật'}</strong>
              </div>
              <div className="status-card">
                <span>Dữ liệu</span>
                <strong>{isPlacesLoading ? 'Đang tải' : `${places.length} vị trí`}</strong>
              </div>
              <div className="status-card">
                <span>Nguồn</span>
                <strong>{placesSource ?? 'Chưa có dữ liệu'}</strong>
              </div>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <span className="eyebrow">Directions</span>
              <h2>Tìm đường</h2>
            </div>

            <div className="transport-switcher" role="tablist" aria-label="Chế độ di chuyển">
              {(['drive', 'bike', 'walk'] as TransportMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={mode === transportMode ? 'is-active' : ''}
                  onClick={() => setTransportMode(mode)}
                >
                  {transportLabels[mode]}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="route-origin">
              Điểm đi
            </label>
            <select
              id="route-origin"
              value={originValue}
              onChange={(event) => setOriginValue(event.target.value)}
              disabled={!hasPlaces}
            >
              <option value="current">Vị trí hiện tại</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.address}
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="route-destination">
              Điểm đến
            </label>
            <select
              id="route-destination"
              value={destinationValue}
              onChange={(event) => setDestinationValue(event.target.value)}
              disabled={!hasPlaces}
            >
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.address}
                </option>
              ))}
            </select>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void buildRoute()}
                disabled={!hasPlaces || isRouteLoading}
              >
                {isRouteLoading ? 'Đang tìm đường...' : 'Tìm đường'}
              </button>
              <button type="button" className="secondary-button" onClick={clearRoute}>
                Xóa tuyến
              </button>
            </div>

            {placesError && <div className="data-alert">{placesError}</div>}
            {routeError && <div className="data-alert">{routeError}</div>}

            {routeInfo && (
              <div className="route-summary">
                <div className="route-summary__headline">
                  <strong>
                    {routeInfo.originLabel} → {routeInfo.destinationLabel}
                  </strong>
                  <span>{transportLabels[routeInfo.transportMode]}</span>
                </div>
                <div className="route-stats">
                  <div>
                    <span>Quãng đường</span>
                    <strong>{formatDistance(routeInfo.distanceInMeters)}</strong>
                  </div>
                  <div>
                    <span>Thời gian</span>
                    <strong>{routeInfo.durationInMinutes} phút</strong>
                  </div>
                </div>
                <div className="steps-list">
                  {routeInfo.steps.map((step, index) => (
                    <div key={`${step}-${index}`} className="step-item">
                      <span>{index + 1}</span>
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {selectedPlace && (
            <section className="panel-section">
              <div className="section-heading">
                <span className="eyebrow">Place detail</span>
                <h2>{selectedPlace.name}</h2>
              </div>
              <p className="muted-text">{selectedPlace.address}</p>
              <p>{selectedPlace.description}</p>
              <div className="detail-pills">
                <span className="pill">{selectedPlace.category}</span>
                {selectedPlace.province && <span className="pill pill--soft">{selectedPlace.province}</span>}
                <span className="pill pill--soft">{selectedPlace.etaLabel}</span>
                <span className="pill pill--soft">{selectedPlace.speedLimit} km/h</span>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setDestinationValue(selectedPlace.id);
                    void buildRoute(selectedPlace.id);
                  }}
                  disabled={isRouteLoading}
                >
                  {isRouteLoading ? 'Đang tìm...' : 'Chỉ đường tới đây'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    selectPlace(selectedPlace);
                  }}
                >
                  Xem trên bản đồ
                </button>
              </div>
            </section>
          )}

          <section className="panel-section">
            <div className="section-heading">
              <span className="eyebrow">Driving monitor</span>
              <h2>Theo dõi tốc độ</h2>
            </div>

            <div className="speed-header">
              <div>
                <span className="field-label">Tốc độ hiện tại</span>
                <strong className={warning ? 'speed-value speed-value--warn' : 'speed-value'}>
                  {currentSpeed} km/h
                </strong>
              </div>
              <div className="accuracy-badge">
                {gpsAccuracy ? `Sai số ±${gpsAccuracy}m` : gpsEnabled ? 'Đang lấy GPS' : 'Chưa có GPS'}
              </div>
            </div>

            <label className="field-label" htmlFor="limit-range">
              Giới hạn tốc độ
            </label>
            <div className="range-row">
              <input
                id="limit-range"
                type="range"
                min="20"
                max="120"
                value={speedLimit}
                onChange={(event) => setSpeedLimit(Number(event.target.value))}
              />
              <span>{speedLimit} km/h</span>
            </div>

            <label className="field-label" htmlFor="manual-speed">
              Tốc độ mô phỏng thủ công
            </label>
            <div className="range-row">
              <input
                id="manual-speed"
                type="range"
                min="0"
                max="120"
                value={currentSpeed}
                onChange={(event) => setCurrentSpeed(Number(event.target.value))}
                disabled={gpsEnabled}
              />
              <span>{gpsEnabled ? 'GPS' : `${currentSpeed} km/h`}</span>
            </div>

            <div className="button-row">
              <button type="button" className="primary-button" onClick={enableGPS} disabled={isLoading}>
                {isLoading ? 'Đang kết nối GPS...' : gpsEnabled ? 'GPS đang hoạt động' : 'Bật GPS theo dõi'}
              </button>
            </div>

            {warning && (
              <div className="alert-banner">
                Bạn đang vượt quá giới hạn {speedLimit} km/h. Hãy giảm tốc độ để an toàn hơn.
              </div>
            )}
          </section>

          <section className="panel-section panel-section--preview">
            <TrafficPreview3D speedLimit={speedLimit} currentSpeed={currentSpeed} />
          </section>
        </aside>
        )}
      </div>
    </div>
  );
}

useGLTF.preload('/models/car_3d.glb');

export default App;
