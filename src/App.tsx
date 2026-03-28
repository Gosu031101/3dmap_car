import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, useGLTF } from '@react-three/drei';
import './App.css';
// Declare google types
declare global {
  interface Window {
    google: any;
  }
}
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY'; // Loaded from .env.local

function CarModel({ speedLimit }: { speedLimit: number }) {
  const { scene } = useGLTF('/models/car_3d.glb');
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (speedLimit / 50);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={[0.01, 0.01, 0.01]} />
    </group>
  );
}

function BuildingModel({ position }: { position: [number, number, number] }) {
  return (
    <Box args={[0.5, Math.random() * 5 + 1, 0.5]} position={position}>
      <meshStandardMaterial color="gray" />
    </Box>
  );
}

function Map3D({ speedLimit }: { speedLimit: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);

  useEffect(() => {
    const initMap = async () => {
      if (mapRef.current && !map) {
        try {
          const { Map } = await window.google.maps.importLibrary("maps");
          const { Marker } = await window.google.maps.importLibrary("marker");

          const newMap = new Map(mapRef.current, {
            center: { lat: 37.7749, lng: -122.4194 }, // San Francisco
            zoom: 15,
            mapTypeId: 'satellite',
            tilt: 45,
          });

          // Add speed limit markers (placeholder data)
          const speedLimitData = [
            { lat: 37.7749, lng: -122.4194, limit: 50 },
            { lat: 37.7750, lng: -122.4200, limit: 30 },
            { lat: 37.7740, lng: -122.4180, limit: 60 },
          ];

          speedLimitData.forEach(data => {
            new Marker({
              position: { lat: data.lat, lng: data.lng },
              map: newMap,
              title: `Giới hạn tốc độ: ${data.limit} km/h`,
              icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" fill="red" stroke="white" stroke-width="2"/>
                    <text x="20" y="25" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${data.limit}</text>
                  </svg>
                `),
                scaledSize: new window.google.maps.Size(40, 40),
              },
            });
          });

          setMap(newMap);
        } catch (error) {
          console.error('Error loading Google Maps:', error);
        }
      }
    };

    // Load Google Maps
    const loader = new Loader({
      apiKey: API_KEY,
      version: 'weekly',
    });

    (loader as any).load().then(() => {
      initMap();
    });
  }, [map]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        camera={{ position: [0, 5, 10], fov: 75 }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <CarModel speedLimit={speedLimit} />
        <BuildingModel position={[2, 0, 0]} />
        <BuildingModel position={[-2, 0, 0]} />

        {/* Thêm GLB models khác nếu có */}
        {/* <GLBModel url="/models/building.glb" position={[3, 0, 0]} scale={[0.1, 0.1, 0.1]} /> */}
        {/* <GLBModel url="/models/tree.glb" position={[-3, 0, 2]} scale={[0.02, 0.02, 0.02]} /> */}

        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
      </Canvas>
    </div>
  );
}

function App() {
  const [speedLimit, setSpeedLimit] = useState(() => {
    const saved = localStorage.getItem('speedLimit');
    return saved ? Number(saved) : 50;
  });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [warning, setWarning] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);

  useEffect(() => {
    setWarning(currentSpeed > speedLimit);
  }, [currentSpeed, speedLimit]);

  useEffect(() => {
    localStorage.setItem('speedLimit', speedLimit.toString());
  }, [speedLimit]);

  const enableGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        () => {
          // Simulate speed calculation (in real app, use position.timestamp differences)
          const simulatedSpeed = Math.floor(Math.random() * 80) + 20; // Random speed for demo
          setCurrentSpeed(simulatedSpeed);
          setGpsEnabled(true);
        },
        (error) => {
          console.error('GPS Error:', error);
          alert('Không thể truy cập GPS. Vui lòng kiểm tra quyền truy cập.');
        },
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    } else {
      alert('Trình duyệt không hỗ trợ GPS.');
    }
  };

  return (
    <div className="App">
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxWidth: '320px', fontFamily: 'Arial, sans-serif' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px', textAlign: 'center' }}>🚗 Speed Control Panel</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Giới hạn tốc độ: {speedLimit} km/h
          </label>
          <input
            type="range"
            min="0"
            max="120"
            value={speedLimit}
            onChange={(e) => setSpeedLimit(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '10px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Tốc độ hiện tại: {currentSpeed} km/h {gpsEnabled ? '(GPS)' : '(Manual)'}
          </label>
          <input
            type="range"
            min="0"
            max="150"
            value={currentSpeed}
            onChange={(e) => setCurrentSpeed(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '10px' }}
            disabled={gpsEnabled}
          />
          <button
            onClick={enableGPS}
            style={{ width: '100%', padding: '5px', background: gpsEnabled ? '#4CAF50' : '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {gpsEnabled ? 'GPS Đã Bật' : 'Bật GPS'}
          </button>
        </div>
        {warning && (
          <div style={{ color: 'white', fontWeight: 'bold', marginTop: '15px', padding: '10px', background: 'linear-gradient(45deg, #ff4444, #ff6666)', borderRadius: '6px', border: '2px solid #cc0000', textAlign: 'center', animation: 'blink 1s infinite' }}>
            🚨 CẢNH BÁO: VƯỢT QUÁ GIỚI HẠN TỐC ĐỘ! 🚨
          </div>
        )}
      </div>
      <Map3D speedLimit={speedLimit} />
    </div>
  );
}

export default App;
