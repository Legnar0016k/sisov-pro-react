FROM alpine:latest

# Instalamos dependencias necesarias
RUN apk add --no-cache \
    unzip \
    ca-certificates

# Descargamos PocketBase (Versión para Linux de 64 bits)
ADD https://github.com/pocketbase/pocketbase/releases/download/v0.21.1/pocketbase_0.21.1_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Exponemos el puerto
EXPOSE 8080

# Comando para iniciar PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080"]