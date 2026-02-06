# 1. Daha stabil və yüngül Node.js versiyası
FROM node:18-alpine

# 2. Təhlükəsizlik üçün: root olmayan istifadəçi ilə işləmək (opsional amma məsləhətdir)
# Alpine-də "node" istifadəçisi artıq mövcuddur.

# 3. İş qovluğunu təyin edirik
WORKDIR /app

# 4. Asılılıqları kopyalayırıq
COPY package*.json ./

# 5. npm install əvəzinə npm ci istifadə edirik (daha sürətli və stabil build üçün)
# Yalnız production asılılıqlarını yükləyirik
RUN npm ci --only=production

# 6. Layihənin qalan hissəsini kopyalayırıq
COPY . .

# 7. Təhlükəsizlik üçün: Proqramı root istifadəçisi ilə yox, "node" istifadəçisi ilə başladırıq
USER node

# 8. Serverin portunu təyin edirik (Render adətən PORT mühit dəyişənini özü verir)
EXPOSE 3000

# 9. Serveri birbaşa node ilə başlatmaq (npm-dən daha az resurs sərf edir)
CMD ["node", "server.js"]
