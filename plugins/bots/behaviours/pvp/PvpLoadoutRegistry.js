"use strict";

function freezeArray(values) {
  return Object.freeze([...values]);
}

function freezeLoadout(loadout) {
  return Object.freeze({
    ...loadout,
    tags: freezeArray(loadout.tags ?? []),
    weaponFamilies: freezeArray(loadout.weaponFamilies ?? []),
    armorFamilies: freezeArray(loadout.armorFamilies ?? []),
    archetypes: freezeArray(loadout.archetypes ?? []),
    inventoryBias: Object.freeze({ ...(loadout.inventoryBias ?? {}) }),
    hotspots: freezeArray(loadout.hotspots ?? []),
  });
}

const PVP_LOADOUTS = Object.freeze({
  edge_main_melee: freezeLoadout({
    id: "edge_main_melee",
    label: "Edge Main Melee",
    tags: ["edge", "melee", "main"],
    weaponFamilies: ["whip", "dds", "dscim", "ags", "anchor", "dharok"],
    armorFamilies: ["fighter", "barrows", "rune", "granite", "mixed", "dharok"],
    archetypes: ["main_whip", "zerker_whip", "zerker_dscim", "ags_zerker", "full_dharok"],
    inventoryBias: { food: 0.55, potions: 0.2, comboEat: 0.05 },
    hotspots: ["edge_ditch", "edge_south", "chaos_temple"],
  }),
  edge_ranged_melee: freezeLoadout({
    id: "edge_ranged_melee",
    label: "Edge Ranged/Melee",
    tags: ["edge", "hybrid", "range"],
    weaponFamilies: ["rune_cb", "msb", "dds", "dscim"],
    armorFamilies: ["dhide", "fighter", "rune", "skeletal", "mixed"],
    archetypes: ["msb_gmaul", "rcb_dds", "msb_dds", "dark_bow_ags", "void_dcb_claws", "void_ballista_ags", "ballista_pure"],
    inventoryBias: { food: 0.5, potions: 0.22, comboEat: 0.08 },
    hotspots: ["edge_ditch", "edge_south"],
  }),
  deep_wild_hybrid: freezeLoadout({
    id: "deep_wild_hybrid",
    label: "Deep Wild Hybrid",
    tags: ["deep", "hybrid", "risk"],
    weaponFamilies: ["ancients", "rune_cb", "staff", "dds"],
    armorFamilies: ["mystic", "dhide", "ahrim", "skeletal"],
    archetypes: ["ancients_hybrid", "elite_ancients_dbow", "tribrid_main", "nh_pure"],
    inventoryBias: { food: 0.4, potions: 0.28, comboEat: 0.12 },
    hotspots: ["mage_bank", "revs_entrance", "chaos_temple"],
  }),
  anti_pk_hybrid: freezeLoadout({
    id: "anti_pk_hybrid",
    label: "Anti-PK Hybrid",
    tags: ["anti", "hybrid", "escape"],
    weaponFamilies: ["staff", "rune_cb", "whip", "dds"],
    armorFamilies: ["dhide", "mystic", "tank", "skeletal"],
    archetypes: ["anti_pk_rcb", "anti_pk_whip", "budget_anti_pk"],
    inventoryBias: { food: 0.5, potions: 0.24, comboEat: 0.1 },
    hotspots: ["edge_south", "chaos_temple", "revs_entrance", "green_drags_gate"],
  }),
  budget_pk: freezeLoadout({
    id: "budget_pk",
    label: "Budget PK",
    tags: ["budget", "edge", "melee"],
    weaponFamilies: ["dscim", "rune_cb", "msb", "anchor"],
    armorFamilies: ["rune", "green_dhide", "granite", "mixed"],
    archetypes: ["budget_scim", "budget_rcb", "budget_msb"],
    inventoryBias: { food: 0.58, potions: 0.14, comboEat: 0.03 },
    hotspots: ["edge_ditch", "edge_south", "chaos_temple"],
  }),
  f2p_strength_pure: freezeLoadout({
    id: "f2p_strength_pure",
    label: "F2P Strength Pure",
    tags: ["edge", "f2p", "melee", "pure"],
    weaponFamilies: ["maple_shortbow", "rune_wh", "rune_baxe"],
    armorFamilies: ["green_dhide", "studded", "light"],
    archetypes: ["f2p_rwh_pure", "f2p_rbaxe_pure"],
    inventoryBias: { food: 0.64, potions: 0.08, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_rune_pure: freezeLoadout({
    id: "f2p_rune_pure",
    label: "F2P Rune Pure",
    tags: ["edge", "f2p", "melee", "rune"],
    weaponFamilies: ["rune_scim", "rune_2h", "rune_baxe"],
    armorFamilies: ["rune", "green_dhide", "mixed"],
    archetypes: ["f2p_rscim_r2h", "f2p_rscim_rbaxe"],
    inventoryBias: { food: 0.62, potions: 0.08, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_range_ko: freezeLoadout({
    id: "f2p_range_ko",
    label: "F2P Range KO",
    tags: ["edge", "f2p", "range", "ko"],
    weaponFamilies: ["maple_shortbow", "rune_2h", "rune_baxe"],
    armorFamilies: ["green_dhide", "studded", "leather"],
    archetypes: ["f2p_maple_r2h", "f2p_maple_rbaxe"],
    inventoryBias: { food: 0.62, potions: 0.08, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_bind_pure: freezeLoadout({
    id: "f2p_bind_pure",
    label: "F2P Bind Pure",
    tags: ["edge", "f2p", "magic", "range"],
    weaponFamilies: ["staff", "maple_shortbow"],
    armorFamilies: ["wizard", "zamorak", "green_dhide"],
    archetypes: ["f2p_bind_blast", "f2p_bind_maple"],
    inventoryBias: { food: 0.58, potions: 0.06, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_addy_pure: freezeLoadout({
    id: "f2p_addy_pure",
    label: "F2P Addy Pure",
    tags: ["edge", "f2p", "melee", "tank"],
    weaponFamilies: ["rune_scim", "rune_2h", "rune_baxe"],
    armorFamilies: ["adamant", "mixed"],
    archetypes: ["f2p_addy_r2h_tank", "f2p_addy_rbaxe_tank"],
    inventoryBias: { food: 0.6, potions: 0.08, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_mage_pure: freezeLoadout({
    id: "f2p_mage_pure",
    label: "F2P Mage Pure",
    tags: ["edge", "f2p", "magic", "pure"],
    weaponFamilies: ["staff"],
    armorFamilies: ["wizard", "zamorak", "monk"],
    archetypes: ["f2p_fire_blast_pure", "f2p_wind_blast_pure"],
    inventoryBias: { food: 0.56, potions: 0.04, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  f2p_bind_ko: freezeLoadout({
    id: "f2p_bind_ko",
    label: "F2P Bind KO",
    tags: ["edge", "f2p", "magic", "melee", "ko"],
    weaponFamilies: ["staff", "rune_2h", "rune_baxe"],
    armorFamilies: ["wizard", "zamorak", "monk"],
    archetypes: ["f2p_bind_r2h", "f2p_bind_rbaxe"],
    inventoryBias: { food: 0.58, potions: 0.06, comboEat: 0.0 },
    hotspots: ["varrock_ditch"],
  }),
  rusher: freezeLoadout({
    id: "rusher",
    label: "Rusher",
    tags: ["rush", "spec", "edge"],
    weaponFamilies: ["dds", "gmaul", "ags", "anchor"],
    armorFamilies: ["light", "fighter", "mixed"],
    archetypes: ["gmaul_rusher", "dds_rusher", "obby_rusher", "obby_mauler"],
    inventoryBias: { food: 0.44, potions: 0.16, comboEat: 0.14 },
    hotspots: ["edge_ditch", "edge_south"],
  }),
});

const PVP_LOADOUT_IDS = Object.freeze(Object.keys(PVP_LOADOUTS));

function getPvpLoadout(loadoutId) {
  return PVP_LOADOUTS[loadoutId] ?? PVP_LOADOUTS.edge_main_melee;
}

function listPvpLoadouts() {
  return PVP_LOADOUT_IDS.map((loadoutId) => PVP_LOADOUTS[loadoutId]);
}

module.exports = {
  PVP_LOADOUT_IDS,
  PVP_LOADOUTS,
  getPvpLoadout,
  listPvpLoadouts,
};
