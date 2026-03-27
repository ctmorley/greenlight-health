/** Common CPT codes for imaging, surgical, and medical procedures. */
export interface CptCodeEntry {
  code: string;
  description: string;
  category: "imaging" | "surgical" | "medical";
}

export const COMMON_CPT_CODES: CptCodeEntry[] = [
  // MRI
  { code: "70551", description: "MRI brain without contrast", category: "imaging" },
  { code: "70553", description: "MRI brain with and without contrast", category: "imaging" },
  { code: "70540", description: "MRI orbit/face/neck without contrast", category: "imaging" },
  { code: "72141", description: "MRI cervical spine without contrast", category: "imaging" },
  { code: "72146", description: "MRI thoracic spine without contrast", category: "imaging" },
  { code: "72148", description: "MRI lumbar spine without contrast", category: "imaging" },
  { code: "72197", description: "MRI pelvis with and without contrast", category: "imaging" },
  { code: "73221", description: "MRI upper extremity joint without contrast", category: "imaging" },
  { code: "73721", description: "MRI lower extremity joint without contrast", category: "imaging" },
  { code: "74181", description: "MRI abdomen without contrast", category: "imaging" },
  { code: "74183", description: "MRI abdomen with and without contrast", category: "imaging" },
  { code: "77084", description: "MRI breast", category: "imaging" },
  // CT
  { code: "70450", description: "CT head/brain without contrast", category: "imaging" },
  { code: "70460", description: "CT head/brain with contrast", category: "imaging" },
  { code: "70553", description: "MRI brain with and without contrast", category: "imaging" },
  { code: "71250", description: "CT chest without contrast", category: "imaging" },
  { code: "71260", description: "CT chest with contrast", category: "imaging" },
  { code: "72125", description: "CT cervical spine without contrast", category: "imaging" },
  { code: "72131", description: "CT lumbar spine without contrast", category: "imaging" },
  { code: "74150", description: "CT abdomen without contrast", category: "imaging" },
  { code: "74177", description: "CT abdomen/pelvis with contrast", category: "imaging" },
  { code: "74178", description: "CT abdomen/pelvis with and without contrast", category: "imaging" },
  // PET/CT
  { code: "78815", description: "PET for limited area", category: "imaging" },
  { code: "78816", description: "PET for whole body", category: "imaging" },
  // Ultrasound
  { code: "76536", description: "Ultrasound soft tissues of head/neck", category: "imaging" },
  { code: "76700", description: "Ultrasound abdominal complete", category: "imaging" },
  { code: "76830", description: "Ultrasound transvaginal", category: "imaging" },
  { code: "76856", description: "Ultrasound pelvic complete", category: "imaging" },
  { code: "93306", description: "Echocardiography transthoracic complete", category: "imaging" },
  // X-Ray
  { code: "71046", description: "X-Ray chest 2 views", category: "imaging" },
  { code: "73030", description: "X-Ray shoulder complete", category: "imaging" },
  { code: "73060", description: "X-Ray humerus", category: "imaging" },
  { code: "73562", description: "X-Ray knee 3 views", category: "imaging" },
  { code: "73610", description: "X-Ray ankle complete", category: "imaging" },
  // Mammography
  { code: "77065", description: "Diagnostic mammography unilateral", category: "imaging" },
  { code: "77066", description: "Diagnostic mammography bilateral", category: "imaging" },
  { code: "77067", description: "Screening mammography bilateral", category: "imaging" },
  // Nuclear
  { code: "78451", description: "Myocardial perfusion imaging single study", category: "imaging" },
  { code: "78452", description: "Myocardial perfusion imaging multiple studies", category: "imaging" },
  { code: "78300", description: "Bone imaging limited area", category: "imaging" },
  { code: "78306", description: "Bone imaging whole body", category: "imaging" },
  // DEXA
  { code: "77080", description: "DEXA bone density axial skeleton", category: "imaging" },
  { code: "77081", description: "DEXA bone density appendicular", category: "imaging" },
  // Fluoroscopy
  { code: "77002", description: "Fluoroscopic guidance needle placement", category: "imaging" },
  { code: "76000", description: "Fluoroscopy up to 1 hour", category: "imaging" },
  // Surgical
  { code: "27447", description: "Total knee replacement", category: "surgical" },
  { code: "27130", description: "Total hip replacement", category: "surgical" },
  { code: "29881", description: "Arthroscopy knee surgical", category: "surgical" },
  { code: "63030", description: "Lumbar laminotomy", category: "surgical" },
  { code: "22551", description: "Cervical fusion anterior approach", category: "surgical" },
  { code: "22612", description: "Lumbar fusion posterior approach", category: "surgical" },
  { code: "49505", description: "Inguinal hernia repair", category: "surgical" },
  { code: "47562", description: "Laparoscopic cholecystectomy", category: "surgical" },
  { code: "44970", description: "Laparoscopic appendectomy", category: "surgical" },
  { code: "43239", description: "Upper GI endoscopy with biopsy", category: "surgical" },
  { code: "45380", description: "Colonoscopy with biopsy", category: "surgical" },
  { code: "19301", description: "Partial mastectomy", category: "surgical" },
  // Medical
  { code: "90837", description: "Psychotherapy 60 minutes", category: "medical" },
  { code: "97110", description: "Therapeutic exercises", category: "medical" },
  { code: "97140", description: "Manual therapy techniques", category: "medical" },
  { code: "96413", description: "Chemotherapy IV infusion", category: "medical" },
  { code: "90834", description: "Psychotherapy 45 minutes", category: "medical" },
  { code: "99213", description: "Office visit established patient", category: "medical" },
  { code: "99214", description: "Office visit established patient detailed", category: "medical" },
];

export const COMMON_ICD10_CODES = [
  { code: "M54.5", description: "Low back pain" },
  { code: "M54.2", description: "Cervicalgia" },
  { code: "M17.11", description: "Primary osteoarthritis, right knee" },
  { code: "M17.12", description: "Primary osteoarthritis, left knee" },
  { code: "M16.11", description: "Primary osteoarthritis, right hip" },
  { code: "M16.12", description: "Primary osteoarthritis, left hip" },
  { code: "M79.3", description: "Panniculitis, unspecified" },
  { code: "G89.29", description: "Other chronic pain" },
  { code: "G43.909", description: "Migraine, unspecified" },
  { code: "R10.9", description: "Unspecified abdominal pain" },
  { code: "R10.0", description: "Acute abdomen" },
  { code: "R06.02", description: "Shortness of breath" },
  { code: "R07.9", description: "Chest pain, unspecified" },
  { code: "I10", description: "Essential hypertension" },
  { code: "E11.9", description: "Type 2 diabetes without complications" },
  { code: "J06.9", description: "Acute upper respiratory infection" },
  { code: "K80.20", description: "Calculus of gallbladder without obstruction" },
  { code: "K40.90", description: "Inguinal hernia without obstruction" },
  { code: "C50.911", description: "Malignant neoplasm breast, right" },
  { code: "C50.912", description: "Malignant neoplasm breast, left" },
  { code: "S06.0X0A", description: "Concussion without loss of consciousness" },
  { code: "S83.511A", description: "Sprain ACL right knee" },
  { code: "M51.16", description: "Intervertebral disc disorders lumbar" },
  { code: "M75.110", description: "Incomplete rotator cuff tear right shoulder" },
  { code: "Z12.31", description: "Encounter for screening mammogram" },
  { code: "Z12.11", description: "Encounter for screening colonoscopy" },
  { code: "F32.1", description: "Major depressive disorder, moderate" },
  { code: "F41.1", description: "Generalized anxiety disorder" },
  { code: "R51.9", description: "Headache, unspecified" },
  { code: "N63.0", description: "Unspecified lump in breast" },
];

/** Search CPT codes by code prefix or description keyword. */
export function searchCptCodes(query: string, category?: string): CptCodeEntry[] {
  const q = query.toLowerCase();
  return COMMON_CPT_CODES.filter((c) => {
    if (category && c.category !== category) return false;
    return c.code.toLowerCase().startsWith(q) || c.description.toLowerCase().includes(q);
  }).slice(0, 20);
}

/** Search ICD-10 codes by code prefix or description keyword. */
export function searchIcd10Codes(query: string) {
  const q = query.toLowerCase();
  return COMMON_ICD10_CODES.filter(
    (c) => c.code.toLowerCase().startsWith(q) || c.description.toLowerCase().includes(q)
  ).slice(0, 20);
}
