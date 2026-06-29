


import { GoogleGenAI, Chat, Type } from "@google/genai";
import type { Exercise, CalorieFormData, NutritionInfo, ParsedWorkout, UserProfile, WaterEstimation } from '../types';

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not found. App will not function correctly.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const cleanAndParseJson = <T,>(jsonString: string): T => {
    let cleanString = jsonString.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = cleanString.match(fenceRegex);

    if (match && match[2]) {
        cleanString = match[2].trim();
    }

    // Attempt to repair common JSON malformations
    let repairedString = cleanString
        .replace(/]\s*[^,{}[\]]*\s*{/g, ']},{') // Fix missing comma between arrays/objects
        .replace(/}\s*{/g, '},{') // Fix missing comma between objects
        .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas

    try {
        return JSON.parse(repairedString) as T;
    } catch (e) {
        // Simple fallback repair
        try {
            repairedString = repairedString.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            return JSON.parse(repairedString) as T;
        } catch (e2) {
            console.error("Failed to parse JSON response:", e, "String:", jsonString);
            throw new Error("Yapay zekadan gelen yanıt işlenemedi.");
        }
    }
};

export const getErrorMessage = (error: unknown): string => {
    let message = "Bilinmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.";
    
    if (typeof error === 'object' && error !== null) {
        if ('error' in error && typeof (error as any).error === 'object') {
             message = String((error as any).error.message || (error as any).error);
        } else if ('message' in error) {
            message = String((error as any).message);
        }
    } else if (typeof error === 'string') {
        message = error;
    }

    if (message.includes('API key') || message.includes('API_KEY')) return 'API anahtarı hatası.';
    if (message.includes('404') || message.includes('NOT_FOUND')) return 'İstenilen model veya kaynak bulunamadı (404).';
    
    return message;
};


export const generateWorkoutPlan = async (muscleGroup: string, equipmentType: string, frequency: string, duration: string): Promise<Exercise[]> => {
    let equipmentPromptPart = '';
    switch (equipmentType) {
        case 'machine': equipmentPromptPart = 'Sadece spor salonu makineleri kullanılarak.'; break;
        case 'free_weights': equipmentPromptPart = 'Sadece serbest ağırlıklar (dumbbell, barbell, kettlebell) kullanılarak.'; break;
        case 'bodyweight': equipmentPromptPart = 'Sadece vücut ağırlığı kullanılarak.'; break;
        default: equipmentPromptPart = 'Çeşitli ekipmanlar (makineler, serbest ağırlıklar, vücut ağırlığı) kullanılabilir.'; break;
    }
    
    const prompt = `
        Bana aşağıdaki kriterlere uygun, yaratıcı ve etkili bir antrenman programı oluştur:
        
        Kriterler:
        - Hedef Kas Grubu: "${muscleGroup}"
        - Ekipman Tercihi: ${equipmentPromptPart}
        - Antrenman Sıklığı: Haftada ${frequency}
        - Antrenman Süresi: Ortalama ${duration}
        
        Talimatlar:
        1. Belirtilen antrenman süresine (${duration}) uygun sayıda egzersiz belirle. (Örn: 15 dk için 2-3 hareket, 1 saat için 6-8 hareket olabilir. Sayıyı sabit 4 yapma, süreye göre optimize et).
        2. Set ve tekrar sayılarını da süreye uygun olarak düşünerek planla (ama JSON çıktısında sadece egzersiz detaylarını ver).
        
        Her egzersiz için şu alanları içeren bir JSON dizisi döndür:
        - 'name': Egzersizin İngilizce adı ve parantez içinde Türkçe çevirisi.
        - 'description': Nasıl yapılacağına dair Türkçe açıklama.
        - 'keyPoints': 3-4 maddelik Türkçe püf noktaları listesi (string array).
        - 'imagePromptEn': Bu egzersizi yapan birini gösteren, fotoğraf kalitesinde görsel oluşturmak için detaylı İngilizce komut.

        Yanıt SADECE JSON formatında olsun. Şema:
        [
            { "name": "...", "description": "...", "keyPoints": ["..."], "imagePromptEn": "..." }
        ]
    `;

    try {
        // 1. Generate the text plan
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const exercises = cleanAndParseJson<any[]>(response.text || '[]');

        // 2. Generate images for each exercise concurrently
        const exercisesWithImages = await Promise.all(exercises.map(async (ex) => {
            let imageUrl = 'https://via.placeholder.com/500x300.png?text=Resim+Olu%C5%9Fturulamad%C4%B1';
            try {
                // Using gemini-2.5-flash-image for image generation
                const imgResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: {
                        parts: [{ text: ex.imagePromptEn || `A fit person performing ${ex.name} in a gym` }]
                    },
                    config: {
                        imageConfig: {
                            aspectRatio: "16:9" // Suitable for cards
                        }
                    }
                });

                // Extract image from response
                if (imgResponse.candidates && imgResponse.candidates[0]?.content?.parts) {
                    for (const part of imgResponse.candidates[0].content.parts) {
                        if (part.inlineData && part.inlineData.data) {
                            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                            break;
                        }
                    }
                }
            } catch (imgError) {
                console.error(`Failed to generate image for ${ex.name}:`, JSON.stringify(imgError));
                // Keep placeholder on error
            }

            return {
                name: ex.name,
                description: ex.description,
                keyPoints: ex.keyPoints,
                imageUrl: imageUrl
            };
        }));

        return exercisesWithImages;

    } catch (error) {
        console.error("Workout generation error:", error);
        throw error;
    }
};

export const calculateCalories = async (data: CalorieFormData): Promise<string> => {
    const prompt = `
        Aşağıdaki bilgilere sahip bir kullanıcı için günlük kalori ihtiyacını ve makro besin dağılımını hesapla.
        Bilgiler:
        - Yaş: ${data.age}
        - Cinsiyet: ${data.gender === 'male' ? 'Erkek' : 'Kadın'}
        - Kilo: ${data.weight} kg
        - Boy: ${data.height} cm
        - Aktivite Seviyesi: ${data.activityLevel}
        - Hedef: ${data.goal === 'lose' ? 'Kilo Vermek' : data.goal === 'gain' ? 'Kilo Almak' : 'Kiloyu Korumak'}

        Lütfen yanıtı şu formatta ver:
        1. Günlük Bazal Metabolizma Hızı (BMR) ve Günlük Kalori İhtiyacı (TDEE).
        2. Hedefe ulaşmak için alması gereken günlük kalori miktarı.
        3. Makro Dağılımı (Protein, Karbonhidrat, Yağ) - gram ve kalori cinsinden.
        4. Kısa, motive edici 3-4 adet beslenme tavsiyesi.

        Yanıtın Türkçe, samimi ve anlaşılır olsun. Markdown formatı kullanabilirsin.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text || "Hesaplama yapılamadı.";
};

export const startChatSession = (userName?: string): Chat => {
    const systemInstruction = `
        Sen Gym Buddy uygulamasının yapay zeka asistanısın. 
        Kullanıcının adı: ${userName || 'Kullanıcı'}.
        Görevin: Kullanıcıya fitness, vücut geliştirme, beslenme ve sağlıklı yaşam konularında yardımcı olmak.
        Tonun: Motive edici, arkadaş canlısı, bilgili ve profesyonel.
        
        ÖNEMLİ - VERİ KARTLARI:
        Eğer kullanıcı *spesifik* bir besinin (örn: 'yumurta besin değeri', 'tavuk kaç kalori') değerlerini sorarsa VEYA *spesifik* bir egzersiz (örn: 'bench press nasıl yapılır', 'squat faydaları') hakkında bilgi isterse, cevabının EN SONUNA aşağıdaki gibi gizli bir JSON bloğu ekle. Bu blok arayüzde özel bir kart olarak gösterilecek.
        
        1. Besin Kartı Formatı:
        :::DATA
        {
          "type": "nutrition",
          "title": "Besin Adı (örn: 100g Haşlanmış Tavuk)",
          "calories": 165,
          "protein": 31,
          "carbs": 0,
          "fat": 3.6
        }
        :::

        2. Egzersiz Kartı Formatı:
        :::DATA
        {
          "type": "exercise",
          "title": "Egzersiz Adı (örn: Bench Press)",
          "difficulty": "Medium", // Easy, Medium veya Hard seç
          "muscleGroup": "Göğüs",
          "equipment": "Barbell & Bench"
        }
        :::

        Eğer kullanıcı bir antrenman programı isterse, cevabın sonunda programı özetleyen bir metin bloğu oluştur ve bu bloğun başına "[PROGRAM_KAYDEDILEBILIR]" etiketini ekle.
    `;

    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: systemInstruction
        }
    });
};

export const analyzeMealImage = async (base64Image: string, mimeType: string): Promise<NutritionInfo> => {
    // Enhanced prompt with references to nutritional databases for higher accuracy
    const prompt = `
        Bu resimdeki yemeği detaylı bir şekilde analiz et.
        
        Lütfen doğruluğu artırmak için şu adımları izle:
        1. Yemeği ve bileşenlerini tanımla.
        2. Görselden porsiyon miktarını (gram veya adet) olabildiğince hassas tahmin et.
        3. Besin değerlerini hesaplarken **USDA FoodData Central** ve **TURKOMP (Ulusal Gıda Kompozisyon Veri Tabanı)** gibi güvenilir kaynakları referans al.

        Şu değerleri belirle:
        - Kalori (kcal)
        - Protein (g), Karbonhidrat (g), Yağ (g), Lif (g)
        - Öne çıkan vitamin ve mineraller
        
        Yanıtı SADECE şu JSON formatında ver:
        {
            "mealName": "Yemek Adı",
            "description": "Tahmin edilen yemek ve porsiyon açıklaması (örn: 200g Izgara Somon ve Buharda Sebze)",
            "calories": 0 (sayı),
            "protein": 0 (sayı, gram),
            "carbohydrates": 0 (sayı, gram),
            "fat": 0 (sayı, gram),
            "fiber": 0 (sayı, gram),
            "vitaminsAndMinerals": [
                { "name": "Vitamin C", "amount": 10, "unit": "mg" }
            ]
        }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Image } },
                { text: prompt }
            ]
        },
        config: { responseMimeType: 'application/json' }
    });

    return cleanAndParseJson<NutritionInfo>(response.text || '{}');
};

export const analyzeMealFromText = async (description: string, weight?: string): Promise<NutritionInfo> => {
    const weightText = weight ? `Porsiyon miktarı: ${weight} gram.` : 'Porsiyon: Standart bir porsiyon varsay.';
    // Enhanced prompt instructing the model to act as a database-backed nutritionist
    const prompt = `
        Profesyonel bir beslenme uzmanı ve gıda mühendisi gibi hareket et. Aşağıdaki yemeği analiz et:
        
        Yemek: "${description}"
        ${weightText}
        
        Doğruluk Talimatı:
        - **USDA** ve **TURKOMP** veri tabanlarındaki ortalama değerleri kullanarak hesaplama yap.
        - Pişirme yönteminin (kızartma, haşlama vb.) besin değerlerine etkisini hesaba kat.
        - Ham maddelerin besin değerlerini toplayarak değil, yemeğin bitmiş halinin standart değerlerini kullan.

        Yanıtı SADECE şu JSON formatında ver:
        {
            "mealName": "Yemek Adı",
            "description": "Analiz edilen yemek ve miktar",
            "calories": 0 (sayı),
            "protein": 0 (sayı, gram),
            "carbohydrates": 0 (sayı, gram),
            "fat": 0 (sayı, gram),
            "fiber": 0 (sayı, gram),
            "vitaminsAndMinerals": []
        }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    return cleanAndParseJson<NutritionInfo>(response.text || '{}');
};

export const parseWorkoutFromText = async (text: string): Promise<ParsedWorkout | null> => {
    const prompt = `
        Aşağıdaki metni analiz et ve içinde bir antrenman programı varsa, bunu yapılandırılmış JSON formatına çevir.
        Metin: """${text}"""
        
        Çıktı Formatı (JSON):
        {
            "category": "Antrenman Kategorisi (örn: Göğüs, Sırt, Bacak)",
            "exercises": [
                {
                    "name": "Egzersiz Adı",
                    "sets": [
                        { "weight": "20", "reps": "12" },
                        { "weight": "20", "reps": "12" }
                    ]
                }
            ]
        }
        Eğer metinde set/tekrar bilgisi yoksa boş bırak. Eğer antrenman yoksa null döndür.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        return cleanAndParseJson<ParsedWorkout>(response.text || 'null');
    } catch (e) {
        console.error("Parse workout error", e);
        return null;
    }
};

export const calculateBodyFat = async (data: { gender: string, height: string, neck: string, waist: string, hip?: string }): Promise<string> => {
    const prompt = `
        ABD Donanması (US Navy) metoduna göre vücut yağ oranını hesapla.
        Bilgiler:
        - Cinsiyet: ${data.gender}
        - Boy: ${data.height} cm
        - Boyun: ${data.neck} cm
        - Bel: ${data.waist} cm
        ${data.gender === 'female' ? `- Kalça: ${data.hip} cm` : ''}
        
        Lütfen yanıtı şu formatta ver:
        1. Tahmini Vücut Yağ Oranı (yüzde olarak).
        2. Bu oranın hangi kategoriye girdiği (örn: Atletik, Fitness, Ortalama, Obez).
        3. Bu kategoriye göre 2-3 cümlelik kısa bir sağlık/fitness tavsiyesi.
        
        Matematiksel formülü kullanarak hesapla. Yanıt Türkçe olsun.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text || "Hesaplama yapılamadı.";
};

export const estimateWaterVolumeFromImage = async (base64Image: string, mimeType: string): Promise<WaterEstimation> => {
    const prompt = `
        Bu resimdeki su kabını (bardak, şişe, sürahi vb.) analiz et ve içindeki su miktarını mililitre (ml) cinsinden tahmin et.
        Kabın türünü, doluluk oranını ve standart boyutları göz önüne al.
        
        Yanıtı SADECE şu JSON formatında ver:
        {
            "estimatedVolume": 0 (tahmin edilen ml değeri, sayı),
            "confidence": "high" | "medium" | "low" (tahmin güveni),
            "reasoning": "Tahminin nedenleri (örn: 'Standart bir su bardağı (200ml) görünüyor ve yaklaşık %80 dolu.')"
        }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Image } },
                { text: prompt }
            ]
        },
        config: { responseMimeType: 'application/json' }
    });
    
    return cleanAndParseJson<WaterEstimation>(response.text || '{}');
};