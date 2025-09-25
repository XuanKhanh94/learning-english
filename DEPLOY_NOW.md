# 🚀 Deploy Cloud Functions ngay bây giờ

## Bước 1: Cài đặt dependencies
```bash
cd functions
npm install
```

## Bước 2: Build functions
```bash
npm run build
```

## Bước 3: Deploy functions
```bash
cd ..
firebase deploy --only functions
```

## Bước 4: Test
1. Vào trang admin
2. Click "Kiểm tra Functions"
3. Nếu thành công, thử xóa user

## Nếu vẫn lỗi:

### Kiểm tra Service Account:
1. Vào Firebase Console > Project Settings > Service Accounts
2. Generate new private key
3. Đặt file JSON vào `functions/serviceAccountKey.json`
4. Cập nhật `functions/src/index.ts`:

```typescript
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});
```

### Kiểm tra billing:
- Firebase Functions cần billing được bật
- Vào Firebase Console > Usage and billing

## Commands để chạy:
```bash
cd D:\Work\learning-english\functions
npm install
npm run build
cd ..
firebase deploy --only functions
```
