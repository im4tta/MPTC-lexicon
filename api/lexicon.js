import lexicon from "../src/data/mptc_lexicon.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=86400");

  res.status(200).json(lexicon);
}
