# 3D Car Map Application

Ứng dụng bản đồ 3D dành riêng cho ô tô với đồ họa 3D của xe và các tòa nhà dựa trên dữ liệu từ Google Maps.

## Cài đặt

1. Cài đặt dependencies:
   ```bash
   npm install
   ```

2. Lấy Google Maps API Key từ [Google Cloud Console](https://console.cloud.google.com/).

3. Thay thế `YOUR_GOOGLE_MAPS_API_KEY` trong `src/App.tsx` bằng API key thực tế của bạn.

## Chạy ứng dụng

```bash
npm run dev
```

Ứng dụng sẽ chạy trên http://localhost:5173/

## Tính năng

- Bản đồ Google Maps với chế độ vệ tinh
- Mô hình 3D của xe (đơn giản)
- Các tòa nhà 3D (placeholder)
- Tích hợp Three.js cho render 3D

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
