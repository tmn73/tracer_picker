// Sert la dernière page de résultats sur le réseau local, pour l'ouvrir depuis un téléphone.
//   npm run phone        (puis ouvrir l'adresse affichée, téléphone sur le même Wi-Fi)
// Seul results/results.html est exposé : jamais l'historique ni le reste du dossier.
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const PORT = Number(process.env.PORT) || 8080;
const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "results",
  "results.html"
);

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };

  if (url !== "/" && url !== "/results.html") {
    res.writeHead(404, headers);
    res.end("Introuvable");
    return;
  }

  try {
    // Relu à chaque requête : un nouveau tirage s'affiche en rechargeant la page
    res.writeHead(200, headers);
    res.end(fs.readFileSync(FILE));
  } catch {
    res.writeHead(404, headers);
    res.end("Aucun résultat : lance d'abord npm start.");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${PORT}`);

  console.log("\n📱 Page des résultats disponible sur le réseau local.");
  console.log("Sur ton téléphone (même Wi-Fi), ouvre l'une de ces adresses :\n");
  addresses.forEach((a) => console.log(`  ${a}`));
  console.log(`  http://${os.hostname()}:${PORT}`);
  console.log("\nCtrl+C pour arrêter.\n");
});
