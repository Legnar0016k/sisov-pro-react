FROM alpine:latest

RUN apk add --no-cache unzip ca-certificates

# Creamos las carpetas y damos permisos de una vez
RUN mkdir -p /pb/pb_data

ADD https://github.com/pocketbase/pocketbase/releases/download/v0.21.1/pocketbase_0.21.1_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Exponemos el puerto que usa Railway por defecto
EXPOSE 8080

# Ejecutamos con permisos totales sobre la carpeta de datos
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data"]