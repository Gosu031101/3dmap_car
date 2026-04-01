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

function Map3D({ speedLimit, onMapLoad }: { speedLimit: number; onMapLoad?: () => void }) {
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
          onMapLoad?.();
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
  const [isLoading, setIsLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    setWarning(currentSpeed > speedLimit);
  }, [currentSpeed, speedLimit]);

  useEffect(() => {
    localStorage.setItem('speedLimit', speedLimit.toString());
  }, [speedLimit]);

  const enableGPS = async () => {
    if (navigator.geolocation) {
      setIsLoading(true);
      try {
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000
          });
        });

        // Simulate speed calculation (in real app, use position.timestamp differences)
        const simulatedSpeed = Math.floor(Math.random() * 80) + 20;
        setCurrentSpeed(simulatedSpeed);
        setGpsEnabled(true);

        // Show success message
        alert('GPS đã được kích hoạt thành công! Tốc độ hiện tại: ' + simulatedSpeed + ' km/h');
      } catch (error) {
        console.error('GPS Error:', error);
        alert('Không thể truy cập GPS. Vui lòng kiểm tra quyền truy cập vị trí.');
      } finally {
        setIsLoading(false);
      }
    } else {
      alert('Trình duyệt không hỗ trợ GPS.');
    }
  };

  return (
    <div className="App">
      <div className="speed-control-panel" style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        padding: '25px',
        borderRadius: '20px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        maxWidth: '350px',
        fontFamily: 'Segoe UI, sans-serif',
        transition: 'all 0.3s ease'
      }}>
        <h3 style={{
          margin: '0 0 20px 0',
          fontSize: '22px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: 700
        }}>
          🚗 3D Car Map Control
        </h3>

        {/* Speed Limit Control */}
        <div className="control-group" style={{
          background: 'rgba(102, 126, 234, 0.05)',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '15px',
          border: '1px solid rgba(102, 126, 234, 0.1)',
          transition: 'all 0.3s ease'
        }}>
          <label style={{
            display: 'block',
            marginBottom: '10px',
            fontWeight: 600,
            color: '#333',
            fontSize: '14px'
          }}>
            ⚙️ Giới hạn tốc độ
          </label>
          <div className="speed-display" style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#667eea',
            textAlign: 'center',
            padding: '10px',
            background: 'rgba(102, 126, 234, 0.1)',
            borderRadius: '8px',
            border: '2px solid rgba(102, 126, 234, 0.2)',
            marginBottom: '15px'
          }}>
            {speedLimit} km/h
          </div>
          <input
            type="range"
            min="0"
            max="120"
            value={speedLimit}
            onChange={(e) => setSpeedLimit(Number(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #667eea, #764ba2)',
              outline: 'none'
            }}
          />
        </div>

        {/* Current Speed Control */}
        <div className="control-group" style={{
          background: 'rgba(102, 126, 234, 0.05)',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '15px',
          border: '1px solid rgba(102, 126, 234, 0.1)',
          transition: 'all 0.3s ease'
        }}>
          <label style={{
            display: 'block',
            marginBottom: '10px',
            fontWeight: 600,
            color: '#333',
            fontSize: '14px'
          }}>
            <span className={`status-indicator ${gpsEnabled ? 'online' : 'offline'}`} style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              marginRight: '8px',
              background: gpsEnabled ? '#2ed573' : '#ff4757',
              boxShadow: gpsEnabled ? '0 0 10px rgba(46, 213, 115, 0.5)' : '0 0 10px rgba(255, 71, 87, 0.5)'
            }}></span>
            Tốc độ hiện tại {gpsEnabled ? '(GPS)' : '(Manual)'}
          </label>
          <div className="speed-display" style={{
            fontSize: '24px',
            fontWeight: 700,
            color: currentSpeed > speedLimit ? '#ff4757' : '#2ed573',
            textAlign: 'center',
            padding: '10px',
            background: currentSpeed > speedLimit ? 'rgba(255, 71, 87, 0.1)' : 'rgba(46, 213, 115, 0.1)',
            borderRadius: '8px',
            border: `2px solid ${currentSpeed > speedLimit ? 'rgba(255, 71, 87, 0.2)' : 'rgba(46, 213, 115, 0.2)'}`,
            marginBottom: '15px'
          }}>
            {currentSpeed} km/h
          </div>
          <input
            type="range"
            min="0"
            max="150"
            value={currentSpeed}
            onChange={(e) => setCurrentSpeed(Number(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #667eea, #764ba2)',
              outline: 'none',
              marginBottom: '15px'
            }}
            disabled={gpsEnabled}
          />
          <button
            onClick={enableGPS}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              background: gpsEnabled ? '#2ed573' : 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? (
              <>
                <span className="loading" style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '20px',
                  border: '3px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '50%',
                  borderTopColor: 'white',
                  animation: 'spin 1s ease-in-out infinite',
                  marginRight: '8px'
                }}></span>
                Đang kết nối GPS...
              </>
            ) : gpsEnabled ? (
              '✅ GPS Đã Kích Hoạt'
            ) : (
              '📍 Kích Hoạt GPS'
            )}
          </button>
        </div>

        {/* Warning Message */}
        {warning && (
          <div className="warning-message" style={{
            color: 'white',
            fontWeight: 'bold',
            marginTop: '15px',
            padding: '15px',
            background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
            borderRadius: '12px',
            border: '2px solid #ff4757',
            textAlign: 'center',
            animation: 'pulse 2s infinite',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <span style={{
              position: 'absolute',
              left: '15px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '24px',
              animation: 'bounce 1s infinite'
            }}>🚨</span>
            <div style={{ marginLeft: '40px' }}>
              CẢNH BÁO: VƯỢT QUÁ GIỚI HẠN TỐC ĐỘ!
              <br />
              <small style={{ fontSize: '12px', opacity: 0.9 }}>
                Vui lòng giảm tốc độ xuống dưới {speedLimit} km/h
              </small>
            </div>
          </div>
        )}

        {/* Status Info */}
        <div style={{
          marginTop: '20px',
          padding: '10px',
          background: 'rgba(102, 126, 234, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(102, 126, 234, 0.1)',
          fontSize: '12px',
          color: '#666',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '5px' }}>
            <span className={`status-indicator ${mapLoaded ? 'online' : 'warning'}`} style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              marginRight: '5px',
              background: mapLoaded ? '#2ed573' : '#ffa502',
              boxShadow: mapLoaded ? '0 0 6px rgba(46, 213, 115, 0.5)' : '0 0 6px rgba(255, 165, 2, 0.5)'
            }}></span>
            Bản đồ: {mapLoaded ? 'Đã tải' : 'Đang tải...'}
          </div>
          <div>
            <span className="status-indicator online" style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              marginRight: '5px',
              background: '#2ed573',
              boxShadow: '0 0 6px rgba(46, 213, 115, 0.5)'
            }}></span>
            Ứng dụng: Hoạt động
          </div>
        </div>
      </div>

      <Map3D speedLimit={speedLimit} onMapLoad={() => setMapLoaded(true)} />
    </div>
  );
}

export default App;
