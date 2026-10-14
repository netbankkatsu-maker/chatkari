import type { Character } from "@/data/characters";
import { characterWardrobe } from "@/lib/wardrobe";

export function CharacterWardrobe({ character }: { character: Character }) {
  const wardrobe = characterWardrobe(character);
  return (
    <details className="character-wardrobe">
      <summary>{character.name}の好み・クローゼット</summary>
      <dl>
        <div><dt>好きな服の種類</dt><dd>{wardrobe.clothingPreferences.join("・")}</dd></div>
        <div><dt>好きな下着の種類</dt><dd>{wardrobe.underwearPreferences.join("・")}</dd></div>
        <div><dt>家にある服</dt><dd><ul>{wardrobe.clothes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></dd></div>
        <div><dt>家にある下着</dt><dd><ul>{wardrobe.underwear.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></dd></div>
      </dl>
    </details>
  );
}
