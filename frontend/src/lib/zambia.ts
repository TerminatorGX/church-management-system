/**
 * Zambia's 10 provinces with their major districts/towns, for the member
 * address picker. Not an exhaustive list of every one of Zambia's 116
 * districts — covers the well-known towns a congregation is realistically
 * drawn from. "City" in the Member model stores the district/town value.
 */
export const ZAMBIA_PROVINCES: { name: string; districts: string[] }[] = [
  {
    name: "Central",
    districts: [
      "Kabwe",
      "Kapiri Mposhi",
      "Mkushi",
      "Mumbwa",
      "Serenje",
      "Chibombo",
      "Chisamba",
      "Itezhi-Tezhi",
      "Luano",
      "Ngabwe",
      "Shibuyunji",
    ],
  },
  {
    name: "Copperbelt",
    districts: [
      "Ndola",
      "Kitwe",
      "Chingola",
      "Mufulira",
      "Luanshya",
      "Kalulushi",
      "Chililabombwe",
      "Masaiti",
      "Lufwanyama",
      "Mpongwe",
    ],
  },
  {
    name: "Eastern",
    districts: [
      "Chipata",
      "Katete",
      "Lundazi",
      "Petauke",
      "Nyimba",
      "Chadiza",
      "Mambwe",
      "Sinda",
      "Vubwi",
      "Chasefu",
      "Lumezi",
      "Lusangazi",
      "Chipangali",
      "Kasenengwa",
    ],
  },
  {
    name: "Luapula",
    districts: [
      "Mansa",
      "Samfya",
      "Kawambwa",
      "Nchelenge",
      "Mwense",
      "Chienge",
      "Chembe",
      "Chipili",
      "Lunga",
      "Mwansabombwe",
      "Milenge",
    ],
  },
  {
    name: "Lusaka",
    districts: ["Lusaka", "Chongwe", "Kafue", "Luangwa", "Rufunsa", "Chilanga"],
  },
  {
    name: "Muchinga",
    districts: ["Chinsali", "Mpika", "Isoka", "Nakonde", "Shiwang'andu", "Mafinga", "Chama", "Lavushimanda"],
  },
  {
    name: "Northern",
    districts: [
      "Kasama",
      "Mbala",
      "Mpulungu",
      "Mungwi",
      "Luwingu",
      "Chilubi",
      "Mporokoso",
      "Kaputa",
      "Nsama",
      "Senga Hill",
      "Lupososhi",
    ],
  },
  {
    name: "North-Western",
    districts: [
      "Solwezi",
      "Kasempa",
      "Mwinilunga",
      "Zambezi",
      "Chavuma",
      "Kabompo",
      "Mufumbwe",
      "Manyinga",
      "Ikelenge",
      "Kalumbila",
    ],
  },
  {
    name: "Southern",
    districts: [
      "Livingstone",
      "Choma",
      "Mazabuka",
      "Monze",
      "Kalomo",
      "Siavonga",
      "Sinazongwe",
      "Namwala",
      "Gwembe",
      "Pemba",
      "Zimba",
      "Chikankata",
      "Chirundu",
      "Kazungula",
    ],
  },
  {
    name: "Western",
    districts: [
      "Mongu",
      "Senanga",
      "Kaoma",
      "Lukulu",
      "Kalabo",
      "Sesheke",
      "Shangombo",
      "Limulunga",
      "Mulobezi",
      "Nalolo",
      "Luampa",
      "Nkeyema",
      "Sioma",
    ],
  },
];

export const districtsForProvince = (province: string | null | undefined): string[] =>
  ZAMBIA_PROVINCES.find((p) => p.name === province)?.districts ?? [];

/** Finds which province a given district belongs to — for editing existing records. */
export const provinceForDistrict = (district: string | null | undefined): string | null => {
  if (!district) return null;
  return ZAMBIA_PROVINCES.find((p) => p.districts.includes(district))?.name ?? null;
};
