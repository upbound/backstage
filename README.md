# [Backstage](https://backstage.io)

This is your newly scaffolded Backstage App, Good Luck!

To start the app, run:

```sh
yarn install
yarn start
```

## Build Backstage Image

```sh
yarn install
yarn install --immutable
yarn tsc
yarn build:backend
docker buildx build . -f packages/backend/Dockerfile --push --platform linux/arm64,linux/amd64 --tag ${REGISTRY}
```
