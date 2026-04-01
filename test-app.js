#!/usr/bin/env node

/**
 * Auto-test script for 3D Car Map Application
 * Tests all major functionalities automatically
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚗 Starting Auto-Test for 3D Car Map Application...\n');

// Test 1: Check if project builds successfully
function testBuild() {
  console.log('📦 Test 1: Building project...');
  return new Promise((resolve, reject) => {
    exec('npm run build', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Build failed:', error.message);
        reject(error);
      } else {
        console.log('✅ Build successful');
        resolve();
      }
    });
  });
}

// Test 2: Check if required files exist
function testFiles() {
  console.log('📁 Test 2: Checking required files...');
  const requiredFiles = [
    'src/App.tsx',
    'src/App.css',
    'src/main.tsx',
    'public/manifest.json',
    'public/models/car_3d.glb',
    'package.json',
    'vite.config.ts'
  ];

  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));

  if (missingFiles.length > 0) {
    console.log('❌ Missing files:', missingFiles);
    return false;
  } else {
    console.log('✅ All required files present');
    return true;
  }
}

// Test 3: Check if dependencies are installed
function testDependencies() {
  console.log('📦 Test 3: Checking dependencies...');
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const requiredDeps = [
      'react',
      'react-dom',
      '@react-three/fiber',
      '@react-three/drei',
      '@googlemaps/js-api-loader',
      'three'
    ];

    const missingDeps = requiredDeps.filter(dep =>
      !packageJson.dependencies || !packageJson.dependencies[dep]
    );

    if (missingDeps.length > 0) {
      console.log('❌ Missing dependencies:', missingDeps);
      return false;
    } else {
      console.log('✅ All required dependencies present');
      return true;
    }
  } catch (error) {
    console.log('❌ Error reading package.json:', error.message);
    return false;
  }
}

// Test 4: Check if environment variables are set
function testEnvironment() {
  console.log('🔧 Test 4: Checking environment variables...');
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env.local file not found');
    return false;
  }

  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('VITE_GOOGLE_MAPS_API_KEY')) {
      console.log('✅ Google Maps API key configured');
      return true;
    } else {
      console.log('❌ Google Maps API key not found in .env.local');
      return false;
    }
  } catch (error) {
    console.log('❌ Error reading .env.local:', error.message);
    return false;
  }
}

// Test 5: Check if PWA manifest is valid
function testPWA() {
  console.log('📱 Test 5: Checking PWA configuration...');
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/manifest.json'), 'utf8'));
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color'];

    const missingFields = requiredFields.filter(field => !manifest[field]);

    if (missingFields.length > 0) {
      console.log('❌ Missing PWA manifest fields:', missingFields);
      return false;
    } else {
      console.log('✅ PWA manifest is valid');
      return true;
    }
  } catch (error) {
    console.log('❌ Error reading PWA manifest:', error.message);
    return false;
  }
}

// Test 6: Check TypeScript compilation
function testTypeScript() {
  console.log('🔷 Test 6: Checking TypeScript compilation...');
  return new Promise((resolve, reject) => {
    exec('npx tsc --noEmit', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ TypeScript compilation failed:');
        console.log(stderr);
        reject(error);
      } else {
        console.log('✅ TypeScript compilation successful');
        resolve();
      }
    });
  });
}

// Test 7: Check if GLB model exists and is accessible
function testGLBModel() {
  console.log('🎨 Test 7: Checking GLB model...');
  const modelPath = path.join(__dirname, 'public/models/car_3d.glb');
  if (fs.existsSync(modelPath)) {
    const stats = fs.statSync(modelPath);
    if (stats.size > 0) {
      console.log('✅ GLB model exists and has content');
      return true;
    } else {
      console.log('❌ GLB model file is empty');
      return false;
    }
  } else {
    console.log('❌ GLB model file not found');
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const results = [];

  try {
    // Synchronous tests
    results.push(testFiles());
    results.push(testDependencies());
    results.push(testEnvironment());
    results.push(testPWA());
    results.push(testGLBModel());

    // Asynchronous tests
    await testBuild();
    results.push(true); // Build passed

    await testTypeScript();
    results.push(true); // TypeScript passed

    // Summary
    const passedTests = results.filter(result => result === true).length;
    const totalTests = results.length;

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);

    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Application is ready for deployment.');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Please fix the issues before deployment.');
      process.exit(1);
    }

  } catch (error) {
    console.log('💥 Critical error during testing:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();