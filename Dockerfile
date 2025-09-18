# Sử dụng image Node.js 22 alpine để build, tối ưu kích thước và hỗ trợ các package mới
FROM node:22-alpine AS build

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép các file package.json và package-lock.json để tận dụng cache
COPY package*.json ./

# Cài đặt tất cả dependencies (bao gồm devDependencies cho vite) và xóa cache
RUN npm install && npm cache clean --force

# Sao chép toàn bộ mã nguồn vào thư mục làm việc
COPY . .
COPY .env ./
# Build ứng dụng React+Vite, sử dụng secrets để truyền biến môi trường Firebase
RUN npm run build

# Sử dụng image Nginx alpine để phục vụ ứng dụng, giảm kích thước
FROM nginx:alpine

# Sao chép các file đã build từ bước trước vào thư mục Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Sao chép file cấu hình Nginx để hỗ trợ React Router
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Mở cổng 80 để Nginx phục vụ
EXPOSE 5173

# Khởi động Nginx
CMD ["nginx", "-g", "daemon off;"]