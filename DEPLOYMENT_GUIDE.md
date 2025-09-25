# Hướng dẫn triển khai Firebase Cloud Functions để xóa hoàn toàn user

## Bước 1: Cài đặt Firebase CLI

```bash
npm install -g firebase-tools
```

## Bước 2: Đăng nhập Firebase

```bash
firebase login
```

## Bước 3: Khởi tạo Functions (nếu chưa có)

```bash
firebase init functions
```

Chọn:
- TypeScript
- ESLint (tùy chọn)
- Install dependencies now

## Bước 4: Cài đặt dependencies

```bash
cd functions
npm install
```

## Bước 5: Cấu hình Firebase Admin SDK

### Tạo Service Account Key:

1. Vào [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Vào **Project Settings** > **Service Accounts**
4. Click **Generate new private key**
5. Tải file JSON về và đặt tên `serviceAccountKey.json`
6. Đặt file này vào thư mục `functions/`

### Cập nhật functions/src/index.ts:

```typescript
import * as admin from 'firebase-admin';

// Khởi tạo với service account key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});
```

## Bước 6: Build và Deploy

```bash
# Build functions
cd functions
npm run build

# Deploy functions
firebase deploy --only functions
```

## Bước 7: Cấu hình Firestore Rules

Cập nhật `firestore.rules` để cho phép Cloud Functions:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cho phép Cloud Functions truy cập
    match /{document=**} {
      allow read, write: if request.auth != null && 
        request.auth.token.admin == true;
    }
    
    // Rules hiện tại của bạn...
  }
}
```

## Bước 8: Test Functions

### Test locally (tùy chọn):

```bash
firebase emulators:start --only functions
```

### Test trên production:

1. Vào trang admin
2. Thử xóa một user test
3. Kiểm tra console để xem logs

## Bước 9: Monitoring

Theo dõi functions trong Firebase Console:
- **Functions** > **Logs** để xem logs
- **Functions** > **Usage** để xem thống kê

## Troubleshooting

### Lỗi Permission Denied:
- Kiểm tra service account key
- Đảm bảo user có role 'admin'
- Kiểm tra Firestore rules

### Lỗi Functions not found:
- Đảm bảo functions đã được deploy
- Kiểm tra tên function trong code

### Lỗi Authentication:
- Kiểm tra Firebase config
- Đảm bảo user đã đăng nhập

## Security Notes

⚠️ **Quan trọng:**
- Không commit file `serviceAccountKey.json` vào git
- Thêm `serviceAccountKey.json` vào `.gitignore`
- Chỉ admin mới có thể xóa user
- Functions có timeout 60 giây mặc định

## Alternative: Sử dụng Firebase Admin SDK trong Backend

Nếu không muốn dùng Cloud Functions, bạn có thể:

1. Tạo một backend server riêng (Node.js/Express)
2. Sử dụng Firebase Admin SDK trong backend
3. Tạo API endpoint để xóa user
4. Gọi API từ frontend

Nhưng Cloud Functions là cách đơn giản và an toàn nhất!
