import { getAllCards } from "../../lib/cards";
import { PublicClient } from "./PublicClient";

export default function PublicCollectionPage() {
  const cards = getAllCards();
  return <PublicClient cards={cards} />;
}
