import { GoogleGenerativeAI, SchemaType, type ObjectSchema } from '@google/generative-ai'

export interface ExtractedOrderData {
  // Project-level
  project_name: string | null
  customer_name: string | null
  due_date: string | null // ISO date string e.g. "2026-06-30"

  // Spec fields (matching ALL_SPEC_FIELD_KEYS from constants.ts)
  product_name: string | null
  style_or_sku: string | null
  season_or_collection: string | null
  factory_name: string | null
  country_of_origin: string | null
  fabric_composition: string | null
  colorways: string | null
  sizes: string | null
  measurements: string | null
  construction_notes: string | null
  packaging_requirements: string | null
  labeling_requirements: string | null
  qc_requirements: string | null
  compliance_requirements: string | null
  target_cost: string | null
  lead_time_target: string | null
  notes: string | null
}

const RESPONSE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    project_name: { type: SchemaType.STRING, nullable: true },
    customer_name: { type: SchemaType.STRING, nullable: true },
    due_date: { type: SchemaType.STRING, nullable: true },
    product_name: { type: SchemaType.STRING, nullable: true },
    style_or_sku: { type: SchemaType.STRING, nullable: true },
    season_or_collection: { type: SchemaType.STRING, nullable: true },
    factory_name: { type: SchemaType.STRING, nullable: true },
    country_of_origin: { type: SchemaType.STRING, nullable: true },
    fabric_composition: { type: SchemaType.STRING, nullable: true },
    colorways: { type: SchemaType.STRING, nullable: true },
    sizes: { type: SchemaType.STRING, nullable: true },
    measurements: { type: SchemaType.STRING, nullable: true },
    construction_notes: { type: SchemaType.STRING, nullable: true },
    packaging_requirements: { type: SchemaType.STRING, nullable: true },
    labeling_requirements: { type: SchemaType.STRING, nullable: true },
    qc_requirements: { type: SchemaType.STRING, nullable: true },
    compliance_requirements: { type: SchemaType.STRING, nullable: true },
    target_cost: { type: SchemaType.STRING, nullable: true },
    lead_time_target: { type: SchemaType.STRING, nullable: true },
    notes: { type: SchemaType.STRING, nullable: true },
  },
  required: [
    'project_name', 'customer_name', 'due_date', 'product_name', 'style_or_sku',
    'season_or_collection', 'factory_name', 'country_of_origin', 'fabric_composition',
    'colorways', 'sizes', 'measurements', 'construction_notes', 'packaging_requirements',
    'labeling_requirements', 'qc_requirements', 'compliance_requirements',
    'target_cost', 'lead_time_target', 'notes',
  ],
}

const SYSTEM_PROMPT = `You are an expert at extracting structured garment/apparel order information from emails and PDF documents.

Extract ONLY information that is explicitly present in the email or attached PDF.
If a field is not mentioned or cannot be found, return null for that field — do NOT guess or invent values.

Field definitions:
- project_name: A short descriptive name for this order/project (use style+season or product+customer if not explicit)
- customer_name: The buyer, brand, or company placing the order
- due_date: Target delivery or completion date (ISO format YYYY-MM-DD, null if not found)
- product_name: Name of the garment or product (e.g. "Men's Crew Neck T-Shirt")
- style_or_sku: Style number, SKU, or reference code
- season_or_collection: Season or collection name (e.g. "SS26", "Fall 2026")
- factory_name: Name of the manufacturing factory
- country_of_origin: Country where the garment will be manufactured
- fabric_composition: Fabric content (e.g. "100% Cotton", "60% Cotton 40% Polyester")
- colorways: Color options or colorways listed (e.g. "White, Black, Navy")
- sizes: Size range (e.g. "XS-XL", "S, M, L, XL, XXL")
- measurements: Any specific body or garment measurements mentioned
- construction_notes: Seam types, stitch specifications, construction details
- packaging_requirements: Packaging instructions (folding, poly bags, hangers, etc.)
- labeling_requirements: Label specs (care labels, brand labels, country of origin labels)
- qc_requirements: Quality control requirements or AQL level
- compliance_requirements: Certifications, standards (e.g. OEKO-TEX, REACH, CPSIA)
- target_cost: Target unit cost or FOB price (include currency, e.g. "$12.50 USD")
- lead_time_target: Target production lead time (e.g. "60 days", "8 weeks")
- notes: Any other relevant information from the email or document`

export async function extractFromEmailAndPdf(
  emailSubject: string,
  emailBody: string,
  senderEmail: string,
  pdfBytes: Buffer
): Promise<ExtractedOrderData> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  })

  const emailContext = `EMAIL FROM: ${senderEmail}
SUBJECT: ${emailSubject}

EMAIL BODY:
${emailBody}

---
The attached PDF document is the order specification or purchase order referenced in this email.`

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: emailContext },
          {
            inlineData: {
              data: pdfBytes.toString('base64'),
              mimeType: 'application/pdf',
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1, // Low temperature for factual extraction
    },
  })

  const responseText = result.response.text()
  const parsed = JSON.parse(responseText) as ExtractedOrderData

  // Replace empty strings with null for cleanliness
  const cleaned: ExtractedOrderData = { ...parsed }
  for (const key of Object.keys(cleaned) as (keyof ExtractedOrderData)[]) {
    if (cleaned[key] === '' || cleaned[key] === 'null') {
      cleaned[key] = null
    }
  }

  return cleaned
}
