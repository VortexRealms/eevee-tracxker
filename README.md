# Eevee Card Tracker

Minimal personal web app for tracking an Eevee & Eeveelution Pokémon TCG collection.

## Card data source

This app **does not** call any paid APIs at runtime. Instead it uses the open
[`PokemonTCG/pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data)
repository as a source of static JSON card data:

- `npm run fetch:cards` reads card JSON from the local `data/pokemon-tcg-data` clone
- It filters that data down to only Eevee and the Eeveelutions
- It writes a local snapshot to `data/cards.json`

The deployed app then reads only from that local `data/cards.json` file.

