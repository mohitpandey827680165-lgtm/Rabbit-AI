import os
import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)
CORS(app)

# ── Known proxy columns for smart mock fallback ──────────────────────────────
PROXY_KNOWLEDGE = {
    "zip_code":          {"risk_score": 92, "risk_category": "Geographic / Racial Proxy",
                          "en": "ZIP codes are highly correlated with race and income due to historical redlining. Using this as a feature can perpetuate systemic discrimination.",
                          "hi": "ZIP कोड ऐतिहासिक रेडलाइनिंग के कारण जाति और आय से अत्यधिक सहसंबंधित हैं।",
                          "es": "Los códigos postales están muy correlacionados con la raza y los ingresos debido a la discriminación histórica.",
                          "fr": "Les codes postaux sont fortement corrélés à la race et aux revenus en raison de la discrimination historique."},
    "zipcode":           {"risk_score": 92, "risk_category": "Geographic / Racial Proxy",
                          "en": "ZIP codes are highly correlated with race and income due to historical redlining.",
                          "hi": "ZIP कोड जाति और आय से सहसंबंधित हैं।",
                          "es": "Los códigos postales están correlacionados con la raza y los ingresos.",
                          "fr": "Les codes postaux sont corrélés à la race et aux revenus."},
    "graduation_year":   {"risk_score": 78, "risk_category": "Age / Generational Proxy",
                          "en": "Graduation year is a direct proxy for age, which is a legally protected class. It can discriminate against older applicants.",
                          "hi": "स्नातक वर्ष आयु का प्रत्यक्ष प्रॉक्सी है, जो एक कानूनी रूप से संरक्षित वर्ग है।",
                          "es": "El año de graduación es un indicador directo de la edad, una clase legalmente protegida.",
                          "fr": "L'année d'obtention du diplôme est un indicateur direct de l'âge, une classe légalement protégée."},
    "high_school_sports":{"risk_score": 65, "risk_category": "Socioeconomic Proxy",
                          "en": "Participation in high school sports correlates with socioeconomic status. Wealthier communities have better-funded sports programs.",
                          "hi": "हाई स्कूल खेलों में भागीदारी सामाजिक-आर्थिक स्थिति से संबंधित है।",
                          "es": "La participación en deportes de secundaria se correlaciona con el nivel socioeconómico.",
                          "fr": "La participation aux sports au lycée est corrélée au statut socioéconomique."},
    "club_memberships":  {"risk_score": 60, "risk_category": "Socioeconomic Proxy",
                          "en": "Club memberships reflect access to resources and affluence, creating a socioeconomic proxy that may disadvantage lower-income applicants.",
                          "hi": "क्लब सदस्यता संसाधनों तक पहुँच और समृद्धि को दर्शाती है।",
                          "es": "Las membresías en clubes reflejan el acceso a recursos y la riqueza.",
                          "fr": "Les adhésions à des clubs reflètent l'accès aux ressources et l'aisance financière."},
    "criminal_record":   {"risk_score": 85, "risk_category": "Racial / Systemic Bias Proxy",
                          "en": "Criminal records disproportionately affect minority communities due to systemic biases in policing and the justice system.",
                          "hi": "आपराधिक रिकॉर्ड अल्पसंख्यक समुदायों को असमान रूप से प्रभावित करते हैं।",
                          "es": "Los antecedentes penales afectan desproporcionadamente a las comunidades minoritarias.",
                          "fr": "Les casiers judiciaires affectent de manière disproportionnée les communautés minoritaires."},
    "marital_status":    {"risk_score": 55, "risk_category": "Gender Proxy",
                          "en": "Marital status can act as a proxy for gender, as women are historically more impacted by marital status-based discrimination.",
                          "hi": "वैवाहिक स्थिति लिंग के लिए प्रॉक्सी के रूप में कार्य कर सकती है।",
                          "es": "El estado civil puede actuar como indicador de género.",
                          "fr": "L'état civil peut servir d'indicateur de genre."},
    "num_dependents":    {"risk_score": 50, "risk_category": "Gender / Family Status Proxy",
                          "en": "Number of dependents can be a proxy for gender and family status, potentially discriminating against women and single parents.",
                          "hi": "आश्रितों की संख्या लिंग और पारिवारिक स्थिति के लिए प्रॉक्सी हो सकती है।",
                          "es": "El número de dependientes puede ser un indicador de género y estado familiar.",
                          "fr": "Le nombre de personnes à charge peut être un indicateur de genre et de statut familial."},
    "university_ranking":{"risk_score": 70, "risk_category": "Socioeconomic Proxy",
                          "en": "University ranking correlates strongly with family wealth and privilege. Elite universities are expensive and less accessible to underrepresented groups.",
                          "hi": "विश्वविद्यालय रैंकिंग पारिवारिक संपत्ति और विशेषाधिकार से जुड़ी है।",
                          "es": "La clasificación universitaria se correlaciona con la riqueza familiar.",
                          "fr": "Le classement universitaire est corrélé à la richesse familiale."},
    "name_origin":       {"risk_score": 88, "risk_category": "Racial / Ethnic Proxy",
                          "en": "Name origin is a direct proxy for race and ethnicity, making it one of the most problematic features in a hiring model.",
                          "hi": "नाम की उत्पत्ति जाति और जातीयता का सीधा प्रॉक्सी है।",
                          "es": "El origen del nombre es un indicador directo de raza y etnicidad.",
                          "fr": "L'origine du nom est un indicateur direct de race et d'ethnicité."},
    "gap_years":         {"risk_score": 58, "risk_category": "Socioeconomic Proxy",
                          "en": "Gap years often reflect socioeconomic necessity (working to fund education) rather than a lack of ambition, unfairly penalising disadvantaged applicants.",
                          "hi": "गैप वर्ष अक्सर आर्थिक आवश्यकता को दर्शाते हैं, महत्वाकांक्षा की कमी को नहीं।",
                          "es": "Los años de pausa reflejan a menudo una necesidad socioeconómica.",
                          "fr": "Les années de pause reflètent souvent une nécessité socioéconomique."},
    "attended_bootcamp": {"risk_score": 45, "risk_category": "Socioeconomic Proxy",
                          "en": "Bootcamp attendance can indicate inability to access traditional 4-year university education due to financial constraints.",
                          "hi": "बूटकैम्प उपस्थिति पारंपरिक विश्वविद्यालय शिक्षा तक पहुँच की असमर्थता का संकेत दे सकती है।",
                          "es": "La asistencia a bootcamp puede indicar incapacidad para acceder a la educación universitaria tradicional.",
                          "fr": "La participation à un bootcamp peut indiquer une incapacité à accéder à l'université traditionnelle."},
}


def generate_mock_analysis(schema_headers, target_variable):
    """Semantic mock analysis using known proxy patterns."""
    flagged = []
    for col in schema_headers:
        key = col.lower().strip()
        if key in PROXY_KNOWLEDGE and key != target_variable.lower():
            p = PROXY_KNOWLEDGE[key]
            flagged.append({
                "column_name": col,
                "risk_score": p["risk_score"],
                "risk_category": p["risk_category"],
                "explanation": {
                    "en": p["en"], "hi": p["hi"], "es": p["es"], "fr": p["fr"]
                }
            })

    # Fairness score: 100 minus weighted penalty for flagged columns
    if flagged:
        penalty = sum(f["risk_score"] for f in flagged) / len(flagged)
        fairness_score = max(5, int(100 - (penalty * len(flagged) * 0.35)))
    else:
        fairness_score = random.randint(88, 97)

    return {"fairness_score": fairness_score, "flagged_columns": flagged}


@app.route('/api/v1/analyze', methods=['POST'])
def analyze():
    payload = request.get_json()

    if not payload or 'data' not in payload or 'target_variable' not in payload:
        return jsonify({"error": "Missing 'data' or 'target_variable'"}), 400

    data = payload['data']
    target_variable = payload['target_variable']

    schema_headers = []
    if data and isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        schema_headers = list(data[0].keys())

    # ── Try live Gemini API first ────────────────────────────────────────────
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
You are an Enterprise AI Ethics Auditor.
Analyze the following dataset headers: {schema_headers}. Identify any 'Hidden Proxies' for protected classes (race, gender, socioeconomic status) that could bias the prediction of the target variable '{target_variable}'.
Do not flag obvious identifiers; focus on contextual proxies like Zip Code or Graduation Year.
Return your analysis STRICTLY matching this JSON schema:
{{
  "fairness_score": <int between 0 and 100>,
  "flagged_columns": [
    {{
      "column_name": "<string — must be one of the input headers>",
      "risk_score": <int between 0 and 100>,
      "risk_category": "<string>",
      "explanation": {{
          "en": "<reasoning in English>",
          "hi": "<reasoning in Hindi>",
          "es": "<reasoning in Spanish>",
          "fr": "<reasoning in French>"
      }}
    }}
  ]
}}
IMPORTANT: Do not hallucinate columns that are not in the input array: {schema_headers}
IMPORTANT: Return ONLY valid JSON. Do not include markdown blocks, and DO NOT use trailing commas.
"""
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Clean up the response text in case it contains Markdown formatting
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
        
        try:
            analysis = json.loads(raw_text)
            print("[INFO] Live Gemini API response received.")
            return jsonify({
                "target_variable": target_variable,
                "schema_headers": schema_headers,
                "analysis": analysis,
                "source": "gemini-live"
            }), 200
        except json.JSONDecodeError as json_err:
            print(f"[ERROR] Failed to parse JSON. Raw response from Gemini:\n{raw_text}")
            raise json_err

    except Exception as e:
        err_str = str(e)
        print(f"[WARN] Gemini API unavailable ({err_str[:120]}). Falling back to semantic mock.")

    # ── Fallback: semantic mock analysis ────────────────────────────────────
    analysis = generate_mock_analysis(schema_headers, target_variable)
    print(f"[INFO] Mock analysis returned. Flagged {len(analysis['flagged_columns'])} columns.")
    return jsonify({
        "target_variable": target_variable,
        "schema_headers": schema_headers,
        "analysis": analysis,
        "source": "semantic-mock"
    }), 200


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)

