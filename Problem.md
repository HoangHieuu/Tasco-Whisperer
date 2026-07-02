### 

**MOBILITY TRACK / PROBLEM STATEMENT**

# **P9) AI-Powered Autocomplete & Query Suggestions**

Autocomplete can reduce friction but needs better intent prediction, Vietnamese language handling, and suggestion ranking.

### **Platform Context**

This challenge is built around Tasco Maps, Vietnam's next-generation digital map platform designed to help users discover places, businesses, services, and mobility experiences.  
Tasco Maps aims to provide intelligent search, local discovery, recommendations, navigation, and location-based experiences tailored for Vietnamese users and businesses.

### **Platform Resources**

This challenge is built on top of the Tasco Maps ecosystem. Participants are encouraged to explore the Tasco Maps application and design solutions that enhance search, discovery, recommendations, AI experiences, and local content rather than replacing the underlying map platform.  
Participants are encouraged to build solutions that are integration-ready with the Tasco Maps ecosystem.

### **Objective**

Build an AI-powered autocomplete engine that predicts user intent and generates relevant search suggestions in real time.  
Autocomplete is often the first interaction users have with a search experience. Traditional autocomplete systems struggle with Vietnamese language complexity, typos, abbreviations, incomplete queries, and intent prediction.  
The solution should help users find what they are looking for faster by providing accurate, relevant, and intelligent suggestions as they type.

### **Core capabilities**

* **Query Prediction:** predict the user's intended query.  
* **Intent Prediction:** predict search intent before query completion.  
* **Vietnamese Language Understanding:** handle accents, typos, abbreviations, and slang.  
* **Smart Suggestions:** generate intelligent and context-aware suggestions.  
* **Personalized Suggestions:** adapt suggestions based on user behavior.  
* **Ranking & Relevance:** rank suggestions by likelihood and relevance.  
* **Real-Time Response:** deliver suggestions with low

### **Example user scenarios**

* vin \-\> Vincom Center Đồng Khởi, VinMart, Vinpearl.  
* cafe \-\> Quán cà phê gần đây, Highlands Coffee.  
* atm \-\> ATM Vietcombank gần nhất.  
* ks da nang \-\> Khách sạn Đà Nẵng gần biển.  
* nguyen hue \-\> Nguyễn Huệ, Quận 1\.  
* ben thanh \-\> Chợ Bến Thành.  
* Challenges include typo handling, missing accents, abbreviation expansion, incomplete queries, intent prediction, personalized suggestions, and real-time performance.

### **Expected output**

* The system should generate ranked autocomplete suggestions in real time.  
* Example output for cafe should include suggestions such as Quán cà phê gần đây, Highlands Coffee, and Cà phê mở cửa 24/7, each with type and score.

### **Expected deliverables**

* Autocomplete Engine.  
* Query Prediction Engine.  
* Suggestion Ranking Engine.  
* Search API / Service.  
* Live demo of autocomplete experience.

### **Submission requirements**

* Presentation deck.  
* Live demonstration or recorded video.  
* Source code repository.  
* README with solution overview, setup instructions, and technologies used.  
* At least 10 example user inputs and generated suggestions.  
* Explanation of prediction and ranking methodology.  
* Description of personalization and intent prediction approach.

### **Suggested architecture**

* **User Input Layer:** user typing input.  
* **Query Understanding Layer:** intent and entity detection.  
* **Prediction Layer:** query prediction.  
* **Suggestion Retrieval Layer:** candidate suggestion generation.  
* **Ranking Layer:** suggestion ranking.  
* **Personalization Layer:** user-specific suggestions.  
* **API Layer:** return ranked suggestions.

### **Success criteria**

* Accurate autocomplete suggestions.  
* Understanding of Vietnamese language variations.  
* Query and intent prediction capabilities.  
* Fast response times suitable for real-time use.  
* High-quality suggestion ranking.  
* Personalized and context-aware recommendations.

### **Provided resources**

* Search Query Dataset with Vietnamese search queries and prefixes.  
* Autocomplete Dataset with historical query and suggestion pairs.  
* POI Dataset with places, businesses, categories, brands, and addresses.  
* Abbreviation Dictionary with common Vietnamese abbreviations.  
* Popular Query Dataset with trending and frequently searched queries.

**BUILD DIRECTION**  
Build a fast suggestion engine that predicts queries, normalizes prefixes, ranks suggestions, and personalizes where appropriate.  
