# 1. Ən stabil və təhlükəsiz Node.js versiyası
FROM node:20-alpine

# 2. Lazımi sistem alətlərini quraşdırırıq (Native modullar üçün)
# Sonda cache təmizlənir ki, hackerlər üçün iz qalmasın
RUN apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

# 3. Serverin iş qovluğunu yaradırıq
WORKDIR /app

# 4. Production mühitini aktiv edirik
ENV NODE_ENV=production

# 5. Kitabxanaların siyahısını (JSON fayllarını) kopyalayırıq
# Bu addım cache-dən istifadə edərək build müddətini sürətləndirir
COPY package*.json ./

# 6. Kitabxanaları quraşdırırıq
# npm install yerinə 'npm ci' istifadə edirik (daha təhlükəsiz və stabil build üçün)
RUN npm ci --only=production && \
    npm cache clean --force

# 7. Bütün kodları və digər JSON fayllarını qovluğa kopyalayırıq
COPY . .

# 8. TƏHLÜKƏSİZLİK ADDIMI: 
# Faylların sahibliyini 'node' istifadəçisinə veririk (Root səlahiyyətini ləğv etmək üçün)
RUN chown -R node:node /app

# 9. Təhlükəsiz istifadəçiyə keçid edirik
# Hack olunsan belə, hacker sistem fayllarına toxuna bilməyəcək
USER node

# 10. Render-in standart portunu açırıq
EXPOSE 10000

# 11. Serveri başladırıq
CMD ["node", "server.js"]
