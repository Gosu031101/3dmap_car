# 3D Car Map Application

Ứng dụng bản đồ 3D dành riêng cho ô tô với đồ họa 3D của xe và các tòa nhà dựa trên dữ liệu từ Google Maps.

## Cài đặt

1. Cài đặt dependencies:
   ```bash
   npm install
   ```

2. **API Key Google Maps:**
   - Tạo file `.env.local` trong thư mục gốc
   - Thêm dòng: `VITE_GOOGLE_MAPS_API_KEY=your_api_key_here`
   - API key đã được cấu hình sẵn trong `.env.local`

3. Chạy ứng dụng:
   ```bash
   npm run dev
   ```

Ứng dụng sẽ chạy trên http://localhost:5173/

## Tính năng

- Bản đồ Google Maps với chế độ vệ tinh
- **Mô hình 3D xe từ file GLB** (`car_3d.glb`)
- Các tòa nhà 3D (placeholder)
- Tích hợp Three.js cho render 3D
- Hỗ trợ file GLB 3D models

## Thêm file GLB 3D Models

1. **Đặt file GLB vào thư mục:**
   ```
   public/models/
   ```
   Ví dụ: `public/models/car.glb`, `public/models/building.glb`

2. **Sử dụng trong code:**
   Trong `src/App.tsx`, bỏ comment và chỉnh sửa:
   ```tsx
   <GLBModel url="/models/car.glb" position={[0, 0, 0]} scale={[0.01, 0.01, 0.01]} />
   ```

3. **Tùy chỉnh:**
   - `url`: Đường dẫn đến file GLB
   - `position`: Vị trí [x, y, z] trong scene 3D
   - `scale`: Kích thước [x, y, z] (thường cần scale nhỏ vì GLB thường ở tỷ lệ thực tế)

## Nguồn tải GLB Models miễn phí

- [Sketchfab](https://sketchfab.com/) - Tìm kiếm "car", "building", "vehicle" với license Creative Commons
- [Poly Haven](https://polyhaven.com/) - Models 3D miễn phí chất lượng cao
- [TurboSquid](https://www.turbosquid.com/) - Một số models miễn phí
- [BlenderKit](https://www.blenderkit.com/) - Thư viện models cho Blender (có thể export sang GLB)

**Lưu ý:** Đảm bảo models có license cho phép sử dụng thương mại nếu cần.

## Lưu ý

Đây là phiên bản demo cơ bản. Để có tích hợp đầy đủ 3D buildings từ Google Maps, cần thêm logic phức tạp hơn để đồng bộ vị trí giữa bản đồ 2D và scene 3D.
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# 3dmap_car
