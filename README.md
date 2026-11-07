# Tracer picker ⛷️

Outil en ligne de commande qui désigne **quel comité fournit le traceur de chaque manche** d'une compétition de ski FFS, de façon équitable et transparente.

## Fonctionnement

1. Tu saisis le code de la compétition (4 ou 5 chiffres).
2. Puppeteer se connecte au site FFS, ouvre la compétition et compte les coureurs par comité.
3. Tirage des traceurs :
   - **Manches 1 et 3** : toujours le comité organisateur.
   - **Manches 2 et 4** : tirage au sort pondéré parmi les autres comités. Le comité tiré en manche 2 est exclu de la manche 4.
4. Tu valides la proposition, ou tu changes une manche à la main (manche et comité au choix).
5. Le résultat est ajouté à l'historique et affiché dans une page HTML.

### Pondération des manches 2 et 4

Le poids d'un comité est le produit de trois facteurs :

| Facteur | Calcul | Effet |
| --- | --- | --- |
| Part de coureurs | `coureurs du comité / coureurs hors comité organisateur` | plus un comité est représenté, plus il pèse |
| Occurrences | `1 / ((traçages passés + 1) × OCCURRENCE_DIVIDER)` | un comité qui a souvent tracé pèse moins ; jamais tracé = poids maximal |
| Attente | `max(MIN, courses depuis le dernier traçage) ^ POWER` | plus un comité attend, plus il pèse |

Les poids sont ensuite normalisés à 100 %. Si tous les poids sont nuls (ex. un seul comité candidat, déjà exclu), le tirage devient uniforme plutôt que de planter.

Les coefficients se règlent dans `ALGO_WEIGHT_KNOBS` (`constants.ts`). Les comités ignorés, les effectifs supplémentaires et les dates de saison sont aussi dans `constants.ts`.

## Installation

```bash
bun install
```

## Configuration

Les identifiants du site FFS se passent par variables d'environnement (Bun charge automatiquement un fichier `.env`) :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `EMAIL` | oui | identifiant du compte FFS |
| `PASSWORD` | oui | mot de passe du compte FFS |
| `USE_SLOMO` | non | si défini, ralentit Puppeteer (utile pour déboguer le scraping) |

Exemple de `.env` :

```
EMAIL=prenom.nom@example.com
PASSWORD=...
```

## Utilisation

```bash
npm start
```

Cela lance `tsx --env-file=.env index.ts` (Node), à exécuter dans un vrai terminal car l'outil est interactif. `bun run index.ts` fonctionne aussi, mais les anciennes versions de Bun plantent sur les prompts (`FilePoll.register failed`).

Fichiers produits dans `results/` :

- `results_history.json` : historique des tirages validés, clé `date_lieu_discipline`. Il alimente la pondération. Si le fichier est vide, un historique vide est utilisé ; s'il contient du JSON invalide, une copie `.corrupted-<timestamp>` est créée et rien n'est écrasé.
- `results.html` : page de résultat, ouverte automatiquement.

## Tests

```bash
bun test
```

Les tests unitaires (`algoSelection.test.ts`) couvrent le tirage et la pondération, sans navigateur ni réseau.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.ts` | point d'entrée, interface et historique |
| `domHelpers.ts` | connexion et navigation sur le site FFS |
| `selectComittees.ts` | récupération des coureurs par comité, affichage des résultats |
| `algoSelection.ts` | tirage et pondération (logique pure, testée) |
| `updateManche.ts` | modification manuelle d'une manche |
| `results/generateHtml.ts` | génération de la page HTML |
| `constants.ts` | comités, saison et coefficients de l'algo |
