# 1. Yüngül Alpine versiyası
FROM node:18-alpine

# 2. Əgər bcryptjs istifadə edirsənsə, python/make/g++ lazım deyil. 
# Amma gələcəkdə native kitabxanalar əlavə etsən deyə saxlamaq olar.
RUN apk add --no-cache python3 make g++

# 3. İş qovluğu
WORKDIR /app

# 4. NODE_ENV-ni production olaraq təyin edirik
ENV NODE_ENV=production

# 5. Paket fayllarını kopyalayırıq
COPY package*.json ./

# 6. Yalnız lazım olan (production) kitabxanaları quraşdırırıq
# npm install yerinə npm ci (clean install) istifadə etmək daha stabil build verir
RUN npm install --only=production

# 7. Kodları kopyalayırıq
COPY . .

# 8. Təhlükəsizlik
USER node

# 9. Render adətən dinamik PORT təyin edir, amma 10000 standartdır
EXPOSE 10000

# 10. Serveri başladırıq
CMD ["node", "server.js"]
