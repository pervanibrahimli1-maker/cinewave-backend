# Əsas olaraq Node.js 18 (Alpine Linux üzərində) istifadə edirik.
FROM node:18-alpine

# İş qovluğunu /app olaraq təyin edirik
WORKDIR /app

# package.json və package-lock.json fayllarını kopyalayırıq
COPY package*.json ./

# Layihə asılılıqlarını quraşdırırıq (yalnız "production" üçün)
RUN npm install --only=production

# Bütün digər layihə fayllarını (server.js və s.) kopyalayırıq
COPY . .

# Serverin dinləyəcəyi portu açırıq
EXPOSE 3000

# Serveri işə salmaq üçün əmri təyin edirik
CMD ["npm", "start"]
