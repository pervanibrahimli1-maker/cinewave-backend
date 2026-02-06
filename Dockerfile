# 1. Əsas olaraq Node.js-in ən stabil və yüngül versiyasını götürürük
FROM node:18-alpine

# 2. Build zamanı bəzi native modullar (məsələn bcrypt) üçün lazım ola biləcək 
# kiçik alətləri yükləyirik (Alpine çox yüngül olduğu üçün bunlar lazım ola bilər)
RUN apk add --no-cache python3 make g++

# 3. İş qovluğunu təyin edirik
WORKDIR /app

# 4. Asılılıqları (dependencies) kopyalayırıq
# Bu, build prosesini sürətləndirir (cache istifadə edir)
COPY package*.json ./

# 5. Bütün kitabxanaları quraşdırırıq 
# (mongoose, bcryptjs, jsonwebtoken, express, cors, dotenv bura daxildir)
RUN npm install

# 6. Layihənin bütün fayllarını (server.js, Dockerfile və s.) konteynerə kopyalayırıq
COPY . .

# 7. Təhlükəsizlik üçün root olmayan istifadəçiyə keçirik
USER node

# 8. Render-in istifadə edəcəyi portu açırıq
EXPOSE 3000

# 9. Serveri işə salırıq
CMD ["node", "server.js"]
