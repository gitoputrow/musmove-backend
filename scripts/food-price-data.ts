import { readFile } from "node:fs/promises";
import { z } from "zod";
import { foodPriceDetailsSchema, foodPriceReferenceSchema, calculateFoodPrice, type FoodPriceDetails } from "../src/modules/meals/prices";
import { loadTkpiSnapshot, type TkpiFood } from "./tkpi-data";

const manifestSchema = z.object({
  checkedAt: z.iso.date(),
  methodVersion: z.literal("internet-reference-estimates-v1"),
  anchors: z.record(z.string(), foodPriceReferenceSchema),
}).strict();

type Method = Extract<FoodPriceDetails, { status: "estimated" }>["method"];
interface Selection { anchor: string; method: Method; yieldFactor?: number; cookingCost?: number; note?: string }
const related = (anchor: string, note?: string): Selection => ({ anchor, method: "similar_food_proxy", note });
const category = (anchor: string): Selection => ({ anchor, method: "category_proxy" });
const same = (anchor: string): Selection => ({ anchor, method: "reference_conversion" });
const cooked = (anchor: string, yieldFactor = 0.85, cookingCost = 1500): Selection => ({ anchor, method: "ingredient_cost_model", yieldFactor, cookingCost });

// These are pricing exclusions, not diagnoses, legal determinations, or changes
// to the historical nutrition dataset. No fictitious ASI/wildlife retail offers.
export function unpricedReason(food: TkpiFood): "NOT_A_RETAIL_FOOD" | "SENSITIVE_FOOD_REQUIRES_REVIEW" | null {
  if (food.code === "JR002") return "NOT_A_RETAIL_FOOD";
  return /penyu|maleo|kura-kura|\bkima\b|sarang|buaya|\bhiu\b|paniki|anjing|\btikus\b|beracun|saga merah|bungkil biji karet|tempe bongkrek/i.test(food.name)
    ? "SENSITIVE_FOOD_REQUIRES_REVIEW" : null;
}

function selectReference(food: TkpiFood): Selection {
  const n = food.name.toLowerCase();
  const raw = food.foodKind === "single" || /mentah|kering/.test(n);
  switch (food.foodGroup) {
    case "cereals": {
      if (/tepung/.test(n)) {
        if (/terigu/.test(n)) return same("flour");
        if (/maizena|jagung/.test(n)) return related("maizena");
        return related("riceFlour");
      }
      if (/bihun/.test(n)) return /goreng/.test(n) ? related("instantNoodles") : related("bihun");
      if (/makaroni/.test(n)) return same("pasta");
      if (/misoa|mi kering/.test(n)) return related("noodleDry");
      if (/mi basah/.test(n)) return related("udon");
      if (/roti putih/.test(n)) return same("bread");
      if (/biskuit/.test(n)) return same("biscuit");
      if (/^beras/.test(n) && /mentah|parboiled/.test(n)) return related(/hitam/.test(n) ? "riceBlack" : /merah/.test(n) ? "riceRed" : "riceWhite");
      if (/^nasi$|nasi tim|beras merah, nasi|ketan.*matang|ketupat|^pulut$/.test(n)) {
        return cooked(/merah/.test(n) ? "riceRed" : /hitam/.test(n) ? "riceBlack" : "riceWhite", /tim/.test(n) ? 4 : 3, 800);
      }
      if (/jagung.*(?:mentah|kering)/.test(n)) return related("corn");
      if (/jagung.*rebus|gerontol|batar|kambose|kapusa/.test(n)) return cooked("corn", 1, 1000);
      if (/^nasi|mie|spaghetti|ketoprak|martabak/.test(n)) return category("preparedStarch");
      if (/tapai/.test(n)) return related("fermentedCassava");
      if (raw) return category("riceWhite");
      return category("pastry");
    }
    case "tubers": {
      if (/tepung|tapioka|mocaf/.test(n)) return related(/tapioka/.test(n) ? "tapioca" : "mocaf");
      if (/keripik|kerupuk|serimping|ceriping|kecimpring|lanting|cassavastick/.test(n)) return category("chips");
      if (/tapai/.test(n)) return related("fermentedCassava");
      if (/bagea|kue|getuk|gurandil|biji nangka|ongol/.test(n)) return category("pastry");
      const anchor = /bengkuang/.test(n) ? "bengkuang" : /kentang/.test(n) ? "potato" : /singkong|ketela/.test(n) ? "cassava" : /sagu/.test(n) ? "tapioca" : "sweetPotato";
      return /kukus|rebus|bakar|papeda|tiwul|gatot|kabuto|oyek/.test(n) ? cooked(anchor, 1, 1000) : related(anchor);
    }
    case "legumes": {
      if (/keripik|kerupik|rempeyek|emping/.test(n)) return category("nutSnack");
      if (/enting|geplak|dodol/.test(n)) return category("pastry");
      if (/peanut butter/.test(n)) return same("peanutButter");
      if (/susu kedelai/.test(n)) return same("soyMilk");
      if (/saridele/.test(n)) return related("powderMilk", "Susu kedelai bubuk diproksi produk bubuk; bukan harga susu kedelai bubuk yang diamati.");
      if (/tauco|tauji/.test(n)) return related("tauco");
      if (/tahu/.test(n)) return /goreng/.test(n) ? same("tofuFried") : /ampas|kembang/.test(n) ? category("tofu") : related("tofu");
      if (/oncom/.test(n)) return related("tempe");
      if (/tempe/.test(n)) return /goreng/.test(n) ? cooked("tempe", 0.85, 1000) : related("tempe");
      if (/mete|kenari/.test(n)) return /goreng/.test(n) ? related("nuts") : related("cashew");
      if (/wijen|kwaci/.test(n)) return related("sesameSeed");
      if (/atom|goyang|sukro|sari|kacang negara/.test(n)) return category("nutSnack");
      const anchor = /kedelai/.test(n) ? "soy" : /kacang tanah/.test(n) ? "peanut" : /kacang merah/.test(n) ? "redBeans" : "beans";
      return /rebus/.test(n) ? cooked(anchor, 2.3, 1000) : /goreng|sangan/.test(n) ? cooked(anchor, 0.9, 1500) : /segar/.test(n) ? category("freshBeans") : related(anchor);
    }
    case "vegetables": {
      if (/cincau/.test(n)) return related("cincau");
      if (/asin/.test(n) && /sawi/.test(n)) return same("pickledVegetable");
      let anchor = "leaf";
      if (/bayam/.test(n)) anchor = "spinach";
      else if (/kangkung/.test(n)) anchor = "kangkung";
      else if (/daun.*singkong|daun kasbi/.test(n)) anchor = "cassavaLeaf";
      else if (/jagung/.test(n)) anchor = "corn";
      else if (/jamur/.test(n)) anchor = "mushroom";
      else if (/kacang panjang/.test(n)) anchor = "longBeans";
      else if (/buncis|kapri|kecipir|koro|polong/.test(n)) anchor = "freshBeans";
      else if (/timun|ketimun/.test(n)) anchor = "cucumber";
      else if (/wortel/.test(n)) anchor = "carrot";
      else if (/tomat/.test(n)) anchor = "tomato";
      else if (/terong|terung/.test(n)) anchor = "eggplant";
      else if (/leunca|lumai|tekokak|rimbang/.test(n)) anchor = "leunca";
      else if (/labu siam/.test(n)) anchor = "chayote";
      else if (/labu|waluh|kundur/.test(n)) anchor = "pumpkin";
      else if (/kol|kool|sawi/.test(n)) anchor = "cabbage";
      else if (/selada/.test(n)) anchor = "lettuce";
      else if (/lobak/.test(n)) anchor = "radish";
      else if (/nangka|kluwih|kelawi/.test(n)) anchor = "youngJackfruit";
      else if (/seledri|peterseli/.test(n)) anchor = "celery";
      else if (/bawang|kucai/.test(n)) anchor = "springOnion";
      if (food.code.startsWith("DP") || /rebus|tumis|masakan/.test(n)) return cooked(anchor, 0.9, 1500);
      return anchor === "leaf" ? category(anchor) : related(anchor);
    }
    case "fruits": {
      if (food.code.startsWith("EP")) return /keripik/.test(n) ? category("chips") : category("fruitSnack");
      const variants: [RegExp, string][] = [
        [/pisang raja/, "bananaRaja"], [/pisang/, "banana"], [/apel/, "apple"], [/mangga/, "mango"],
        [/jambu/, "guava"], [/nanas/, "pineapple"], [/pepaya|carica/, "papaya"], [/jeruk nipis/, "lime"],
        [/jeruk|lemon|purut/, "orange"], [/naga/, "dragonFruit"], [/salak/, "salak"], [/melon|semangka/, "melon"],
        [/belimbing/, "starFruit"], [/arbai/, "strawberry"], [/kelapa/, "coconutMeat"],
      ];
      const match = variants.find(([pattern]) => pattern.test(n));
      return match ? related(match[1]) : category("fruit");
    }
    case "meat_poultry": {
      if (/abon/.test(n)) return related("abon");
      if (/kornet/.test(n)) return same("cornedBeef");
      if (/sosis|ham/.test(n)) return related("sausage");
      if (/asap|dendeng/.test(n)) return related("smokedBeef");
      if (/rendang/.test(n)) return related("cookedBeef");
      if (/burger/.test(n)) return category("preparedMeat");
      const anchor = /ayam|manuk|itik|bebek|angsa|belibis|punai|jangang|ciken/.test(n) ? "chicken" : /hati|liver|ginjal|daleman|babat|otak|usus/.test(n) ? "offal" : "beef";
      if (food.code.startsWith("FR")) return related(anchor);
      // Soups contain broth. These explicit planning assumptions are NOT a
      // claimed TKPI recipe or a restaurant's measured serving composition.
      if (/sop|soto|coto|rawon|kuah|konro/.test(n)) return cooked(anchor, 4, 2000);
      return cooked(anchor, 0.75, 2500);
    }
    case "fish_seafood": {
      if (/pempek|tekwan|model|fillet o.fish/.test(n)) return category("fishCake");
      if (/abon/.test(n)) return related("abon");
      if (/kaleng/.test(n)) return related("cannedFish");
      if (/kering|tepung|bubuk|asin/.test(n)) return related(/rebon|udang/.test(n) ? "driedShrimp" : "driedFish");
      if (/asap|asar|pindang/.test(n)) return related("cookedFish");
      const anchor = /udang|rebon/.test(n) ? "shrimp" : /kerang|lokan|tiram|keong|bekicot/.test(n) ? "clams" : /mas,|mujah|mujai|patin|gabus|belut|sidat|papuyu|betok|saluang/.test(n) ? "freshwaterFish" : "marineFish";
      return food.code.startsWith("GR") ? category(anchor) : cooked(anchor, 0.8, 2000);
    }
    case "eggs": {
      const anchor = /puyuh/.test(n) ? "quailEggs" : "eggs";
      if (food.code.startsWith("HP")) return cooked(anchor, 0.9, 1500);
      if (/bagian putih|bagian kuning/.test(n)) return { ...cooked(anchor, /kuning/.test(n) ? 0.3 : 0.6, 0), note: "Seluruh biaya telur diasumsikan ditanggung bagian ini; putih/kuning sisa tidak dikreditkan. Bukan harga produk putih/kuning telur kemasan." };
      return related(anchor);
    }
    case "dairy": {
      if (/bubuk/.test(n)) return related("powderMilk");
      if (/kental manis/.test(n)) return related("condensedMilk");
      if (/kental tak manis/.test(n)) return related("evaporatedMilk");
      if (/keju|kwark/.test(n)) return related("cheese");
      if (/yoghurt|hangop/.test(n)) return related("yogurt");
      if (/es krim/.test(n)) return category("iceCream");
      return /sapi/.test(n) ? same("milk") : category("milk");
    }
    case "fats_oils": {
      if (/margarin/.test(n)) return same("margarine");
      if (/mentega/.test(n)) return same("butter");
      if (/santan/.test(n)) return related("coconutMilk");
      if (/kelapa.*daging/.test(n)) return related("coconutMeat");
      if (/zaitun/.test(n)) return same("oliveOil");
      if (/wijen/.test(n)) return related("sesameOil");
      if (/minyak kelapa$/.test(n)) return same("coconutOil");
      if (/sawit/.test(n)) return same("palmOil");
      if (/minyak/.test(n)) return category("palmOil");
      return category("animalFat");
    }
    case "sugars_confectionery": {
      if (/kopi/.test(n)) return same("coffee");
      if (/teh/.test(n)) return related("tea");
      if (/madu/.test(n)) return same("honey");
      if (/coklat.*bubuk/.test(n)) return related("cocoa");
      if (/coklat/.test(n)) return related("chocolate");
      if (/gula putih/.test(n)) return same("sugar");
      if (/gula/.test(n)) return related("palmSugar");
      if (/selai|jam,/.test(n)) return related("jam");
      return category("syrup");
    }
    case "condiments": {
      const variants: [RegExp, string][] = [
        [/bawang merah/, "shallot"], [/bawang putih/, "garlic"], [/jahe/, "ginger"], [/kunyit/, "turmeric"],
        [/lengkuas|laja/, "galangal"], [/kunci/, "fingerroot"], [/cabai hijau/, "greenChili"], [/cabai|cabe/, "chili"],
        [/asam|asan/, "tamarind"], [/kecap/, "soySauce"], [/saos|saus/, "tomatoSauce"], [/cuka/, "vinegar"],
        [/terasi|petis|balichong|bekasam|bekasang/, "shrimpPaste"], [/tempoya/, "fruitSnack"],
        [/kemiri/, "candlenut"], [/ketumbar/, "coriander"], [/merica/, "pepper"], [/kluwek/, "kluwek"],
        [/cengkeh|pala/, "drySpice"], [/salam/, "driedBayLeaf"],
      ];
      const match = variants.find(([pattern]) => pattern.test(n));
      return match ? related(match[1]) : category("drySpice");
    }
    case "beverages": return related("coconutWater");
  }
}

export async function buildFoodPrices() {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(new URL("../src/db/data/food-price-references-2026-10-18.json", import.meta.url), "utf8")));
  const snapshot = await loadTkpiSnapshot();
  const foods = snapshot.foods.filter(food => food.nutrients.caloriesKcal !== null && food.nutrients.proteinGrams !== null);
  const assumptions = ["Harga estimasi per 100 g bagian dapat dimakan, bukan harga live/penawaran jual atau rata-rata survei nasional. Ongkir tidak termasuk."];
  const defaults: Record<string, number> = { cereals: 1, tubers: 0.85, legumes: 1, vegetables: 0.8, fruits: 0.75, meat_poultry: 0.7, fish_seafood: 0.6, eggs: 0.88 };
  return foods.map(food => {
    const reason = unpricedReason(food);
    if (reason) return { id: `tkpi-${food.code.toLowerCase()}`, sourceCode: food.code, samplePriceRupiah: null, priceDetails: foodPriceDetailsSchema.parse({
      methodVersion: manifest.methodVersion, currency: "IDR", basisGrams: 100, checkedAt: manifest.checkedAt,
      status: "not_priced", label: "Tidak diberi estimasi harga", reasonCode: reason,
      reference: null, calculation: null, assumptions: ["Tidak membuat harga jual fiktif; item non-ritel/sensitif memerlukan keputusan produk dan pemeriksaan tersendiri."],
    }) };
    const selected = selectReference(food);
    const reference = manifest.anchors[selected.anchor];
    if (!reference) throw new Error(`Missing reviewed price anchor: ${selected.anchor}`);
    const notes = [...assumptions];
    if (selected.method !== "reference_conversion") notes.push(`Pembanding: ${reference.productName}. ${selected.method === "category_proxy" ? "Hanya proksi kelompok; harga individual pangan ini tidak ditemukan/diverifikasi." : "Varietas, merek, spesies, bentuk atau resep pembanding dapat berbeda; bukan observasi harga individual pangan ini."}`);
    let density: number | null = null;
    if (reference.unit === "ml") {
      density = /Oil|Minyak/i.test(reference.productName) ? 0.92 : /susu|milk|yogurt/i.test(reference.productName) ? 1.03 : 1;
      notes.push(`Konversi volume memakai asumsi massa jenis ${density} g/ml; bukan menyamakan otomatis 100 ml dengan 100 g atau hasil timbang produk.`);
    }
    const edibleFraction = reference.edibleBasis === "edible" ? 1 : food.ediblePercent && food.ediblePercent > 0 ? food.ediblePercent / 100 : defaults[food.foodGroup] ?? 1;
    if (reference.edibleBasis === "as_purchased") notes.push(food.ediblePercent && food.ediblePercent > 0
      ? `Harga berat beli dikonversi dengan BDD TKPI ${food.ediblePercent}%; BDD produk toko bisa berbeda.`
      : `BDD sumber pangan kosong; diasumsikan ${Math.round(edibleFraction * 100)}% bagian dapat dimakan untuk perencanaan, belum diukur.`);
    if (selected.method === "ingredient_cost_model") notes.push(`Model biaya bahan, bukan harga menu restoran: yield berat matang/bahan ${selected.yieldFactor}; tambahan biaya masak asumsi Rp${selected.cookingCost}/100 g. Bukan resep TKPI tervalidasi; tenaga kerja/markup tidak dihitung.`);
    if (selected.note) notes.push(selected.note);
    if (reference.access === "historical_document") notes.push(`Rujukan harga historis bertanggal ${reference.sourceDate}; tidak diinflasikan atau diklaim sebagai harga pasar terkini.`);
    notes.push("checkedAt adalah tanggal pemeriksaan sumber; sourceDate null berarti tanggal berlakunya harga tidak dinyatakan toko. Stok, promo dan harga checkout bisa berbeda.");
    const calculation = { sourceWeightGrams: reference.quantity * (density ?? 1), densityGramsPerMl: density,
      edibleFraction, cookedYieldFactor: selected.yieldFactor ?? 1, cookingCostRupiahPer100g: selected.cookingCost ?? 0, roundingRupiah: 100 as const };
    const priceDetails = foodPriceDetailsSchema.parse({ methodVersion: manifest.methodVersion, currency: "IDR", basisGrams: 100, checkedAt: manifest.checkedAt,
      status: "estimated", label: "Estimasi harga, bukan harga jual pasti", method: selected.method,
      confidence: selected.method === "reference_conversion" ? "medium" : "low", reference, calculation, assumptions: notes });
    return { id: `tkpi-${food.code.toLowerCase()}`, sourceCode: food.code, samplePriceRupiah: calculateFoodPrice(reference, calculation), priceDetails };
  });
}
