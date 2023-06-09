# Speech2Text App

A simple application meant to be used to help input text by voice. This is a client for
[speech2text-server](https://github.com/davidrios/speech2text-server).

Screenshot:

![app window](./docs/app-window.png)


There's a compiled version at: https://davidrios.github.io/speech2text-app/. Note that 
because it's served from a real domain with HTTPS, this version can only connect to
TLS secured addresses or `localhost`.


## Development

This is a Quasar framework application.


### Install the dependencies
```bash
yarn
# or
npm install
```

#### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
# for the web
quasar dev

# Electron app
quasar dev -m electron
```


#### Lint the files
```bash
yarn lint
# or
npm run lint
```


#### Build the app for production
```bash
# for the web
quasar build

# Electron app
quasar build -m electron
```
