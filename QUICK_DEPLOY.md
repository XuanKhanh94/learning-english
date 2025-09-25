# Hướng dẫn nhanh deploy Cloud Functions

## Bước 1: Cài đặt Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

## Bước 2: Cài đặt dependencies
```bash
cd functions
npm install
```

## Bước 3: Cấu hình Service Account

### Tạo Service Account Key:
1. Vào [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Vào **Project Settings** > **Service Accounts**
4. Click **Generate new private key**
5. Tải file JSON về
6. Đặt tên file là `serviceAccountKey.json`
7. Copy file vào thư mục `functions/`

### Cập nhật functions/src/index.ts:
Thay thế dòng:
```typescript
admin.initializeApp();
```

Bằng:
```typescript
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});
```

## Bước 4: Build và Deploy
```bash
# Build functions
npm run build

# Deploy functions
firebase deploy --only functions
```

## Bước 5: Test
1. Vào trang admin
2. Thử xóa một user test
3. Kiểm tra Firebase Console > Authentication để xem user có bị xóa không

## Troubleshooting

### Lỗi "Functions not found":
- Đảm bảo functions đã được deploy thành công
- Kiểm tra Firebase Console > Functions

### Lỗi "Permission denied":
- Kiểm tra service account key
- Đảm bảo user có role 'admin'

### Lỗi "Authentication failed":
- Kiểm tra Firebase config
- Đảm bảo user đã đăng nhập

## Kiểm tra Functions đã deploy:
```bash
firebase functions:list
```

## Xem logs:
```bash
firebase functions:log
```

## Nếu vẫn không được:
1. Kiểm tra Firebase Console > Functions
2. Xem logs trong Functions tab
3. Đảm bảo billing đã được bật cho project
