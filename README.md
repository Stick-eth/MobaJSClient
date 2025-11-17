# MobaJSClient

## Configuration de l'environnement

1. Copier `.env.example` en `.env` à la racine du client.
2. Définir les variables suivantes :
	- `VITE_SERVER_URL` : URL du serveur Socket.IO (ex. `http://localhost:3000` ou l'adresse publique de votre machine).
	- `VITE_DEV_COMMANDS_TOKEN` *(optionnel)* : jeton à transmettre au serveur pour autoriser les commandes de développement.

## Lancement

```bash
npm install
npm run dev
```

## Classes jouables

- **Tireur (marksman)** : attaques à distance, Q en skillshot (projectile). 100 PV.
- **Mêlée** : attaques au corps à corps renforcées, Q réinitialise l'auto-attaque et ajoute +10 dégâts à la prochaine frappe. 150 PV.

Le choix de la classe se fait depuis le menu d'accueil avant de rejoindre la partie ou durant l'écran de réapparition.

Sync version : 0.0.2