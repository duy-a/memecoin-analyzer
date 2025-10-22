# Memecoin Analyzer

A minimal Vue 3 + Vite single-page application for looking up Solana memecoin data from the Moralis API. Enter a token address to retrieve and display its associated pair address.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy the example file and add your Moralis API key:

   ```bash
   cp .env.example .env.local
   ```

   Then edit `.env.local` and set the `VITE_MORALIS_API_KEY` value.

3. **Run the development server**

   ```bash
   npm run dev
   ```

   The app will be served on [http://localhost:5173](http://localhost:5173).

4. **Build for production**

   ```bash
   npm run build
   ```

## Environment variables

All requests to Moralis require the `X-API-Key` header. In Vite, define the `VITE_MORALIS_API_KEY` variable in `.env.local` (not committed to source control). The app reads this value at build time and attaches it to every request.

## Deployment

The project is preconfigured for Netlify. Build with `npm run build` and deploy the `dist` folder.
