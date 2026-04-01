import { promises as fs } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const dataDirectory = path.join(workspaceRoot, 'public', 'data');
const outputPath = path.join(dataDirectory, 'destination-index.json');

function splitCoordinateString(value) {
  const parts = value.trim().split(/[,\s]+/).map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return [parts[0], parts[1]];
}

function collectCoordinatePairs(node, pairs = []) {
  if (typeof node === 'string') {
    const parsed = splitCoordinateString(node);
    if (parsed) {
      pairs.push(parsed);
    }
    return pairs;
  }

  if (!Array.isArray(node)) {
    return pairs;
  }

  if (
    node.length >= 2 &&
    typeof node[0] === 'number' &&
    Number.isFinite(node[0]) &&
    typeof node[1] === 'number' &&
    Number.isFinite(node[1])
  ) {
    pairs.push([node[0], node[1]]);
    return pairs;
  }

  for (const child of node) {
    collectCoordinatePairs(child, pairs);
  }

  return pairs;
}

function getRepresentativePosition(geometry) {
  const pairs = collectCoordinatePairs(geometry?.coordinates);
  if (pairs.length === 0) {
    return null;
  }

  const [sumLongitude, sumLatitude] = pairs.reduce(
    (totals, [longitude, latitude]) => [totals[0] + longitude, totals[1] + latitude],
    [0, 0]
  );

  return [sumLatitude / pairs.length, sumLongitude / pairs.length];
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toTitleFromFilename(filename) {
  return filename
    .replace(/\.geojson$/i, '')
    .replace(/_(tinh|phuong)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function buildDescription(properties, level) {
  const parts = [];

  if (typeof properties.sap_nhap === 'string' && properties.sap_nhap.trim()) {
    parts.push(`Sáp nhập: ${properties.sap_nhap.trim()}`);
  }

  if (typeof properties.tru_so === 'string' && properties.tru_so.trim() && properties.tru_so.trim() !== 'đang cập nhật') {
    parts.push(`Trụ sở: ${properties.tru_so.trim()}`);
  }

  if (typeof properties.dan_so === 'number' && Number.isFinite(properties.dan_so)) {
    parts.push(`Dân số: ${properties.dan_so.toLocaleString('vi-VN')}`);
  }

  if (parts.length === 0) {
    return level === 'ward' ? 'Địa chỉ cấp phường/xã từ GeoJSON.' : 'Địa chỉ cấp tỉnh từ GeoJSON.';
  }

  return parts.join(' · ');
}

function createPlaceRecord(feature, fileName, featureIndex) {
  const properties = feature?.properties ?? {};
  const position = getRepresentativePosition(feature?.geometry);

  if (!position) {
    return null;
  }

  const isWardFile = /_phuong\.geojson$/i.test(fileName);
  const provinceName =
    (typeof properties.ten_tinh === 'string' && properties.ten_tinh.trim()) ||
    toTitleFromFilename(fileName);
  const name =
    (typeof properties.ten_xa === 'string' && properties.ten_xa.trim()) ||
    (typeof properties.ten_tinh === 'string' && properties.ten_tinh.trim()) ||
    (typeof properties.name === 'string' && properties.name.trim()) ||
    `${provinceName} ${featureIndex + 1}`;
  const level = isWardFile || typeof properties.ten_xa === 'string' ? 'ward' : 'province';
  const category =
    (typeof properties.loai === 'string' && properties.loai.trim()) ||
    (level === 'ward' ? 'Phường/Xã' : 'Tỉnh');
  const address = level === 'ward' ? `${name}, ${provinceName}` : provinceName;
  const description = buildDescription(properties, level);
  const speedLimit = level === 'ward' ? 40 : 50;
  const code = properties.ma_xa ?? properties.ma_tinh ?? feature.id ?? `${slugify(fileName)}-${featureIndex}`;

  return {
    id: `${slugify(fileName)}-${code}`,
    name,
    address,
    province: provinceName,
    category,
    description,
    position,
    speedLimit,
    etaLabel: level === 'ward' ? 'Địa chỉ cấp phường/xã' : 'Địa chỉ cấp tỉnh',
    level,
    sourceFile: fileName,
  };
}

const directoryEntries = await fs.readdir(dataDirectory, { withFileTypes: true });
const geoJsonFiles = directoryEntries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((fileName) => fileName.endsWith('.geojson'))
  .filter((fileName) => fileName !== 'map.geojson')
  .sort((left, right) => left.localeCompare(right));

const destinationPlaces = [];

for (const fileName of geoJsonFiles) {
  const fullPath = path.join(dataDirectory, fileName);
  const rawContent = await fs.readFile(fullPath, 'utf8');
  const parsed = JSON.parse(rawContent);
  const features = Array.isArray(parsed?.features) ? parsed.features : [];

  for (let index = 0; index < features.length; index += 1) {
    const place = createPlaceRecord(features[index], fileName, index);
    if (place) {
      destinationPlaces.push(place);
    }
  }
}

destinationPlaces.sort((left, right) => {
  if (left.level !== right.level) {
    return left.level === 'ward' ? -1 : 1;
  }

  const provinceCompare = left.province.localeCompare(right.province, 'vi');
  if (provinceCompare !== 0) {
    return provinceCompare;
  }

  return left.name.localeCompare(right.name, 'vi');
});

await fs.writeFile(outputPath, JSON.stringify(destinationPlaces, null, 2), 'utf8');

console.log(`Built ${destinationPlaces.length} places into ${path.relative(workspaceRoot, outputPath)}`);
