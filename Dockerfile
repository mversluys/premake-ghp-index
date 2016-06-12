FROM node:6

RUN mkdir -p /usr/src/premake-ghp-index
WORKDIR /usr/src/premake-ghp-index

COPY package.json /usr/src/premake-ghp-index
RUN npm install

COPY . /usr/src/premake-ghp-index

EXPOSE 5000

CMD [ "npm", "start" ]