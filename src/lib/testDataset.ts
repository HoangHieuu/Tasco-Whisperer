import { buildDatasetFromCsvs, DATA_FILES } from './dataset';

export const testCsvs = {
  [DATA_FILES.abbreviations]: `abbreviation,expanded_form,type
q1,Quận 1,district
ks,Khách sạn,category
bv,Bệnh viện,category
vcb,Vietcombank,brand
`,
  [DATA_FILES.autocomplete]: `suggestion_id,input_prefix,suggestion_text,suggestion_type,score,query_frequency
SUG001,vin,Vincom Center,Brand Search,0.98,3355
SUG002,vin,Vinmec,Brand Search,0.95,565
SUG003,vin,Vinpearl,Brand Search,0.92,9097
SUG004,cafe,Quán cà phê gần đây,Category Search,0.97,6265
SUG005,cafe,Highlands Coffee,Brand Search,0.94,1332
SUG006,cafe,Cà phê mở cửa 24/7,Discovery Search,0.88,8383
SUG007,atm,ATM Vietcombank gần nhất,Nearby Search,0.96,6182
SUG008,atm,ATM BIDV gần đây,Nearby Search,0.91,4863
SUG009,atm,ATM gần sân bay,Nearby Search,0.86,2806
SUG010,nguyen hue,"Nguyễn Huệ, Quận 1, TP.HCM",Address Suggestion,0.95,8176
`,
  [DATA_FILES.pois]: `poi_id,poi_name,category,brand,address,city,latitude,longitude,rating,review_count,popularity_score,tags
POI001,Highlands Coffee Nguyễn Huệ,Quán cà phê,Highlands Coffee,"86 Nguyễn Huệ, Quận 1, TP.HCM",TP.HCM,10.7759,106.7031,4.3,1250,88,wifi;yên tĩnh;làm việc;takeaway
POI002,Chợ Bến Thành,Chợ,,"Lê Lợi, Quận 1, TP.HCM",TP.HCM,10.772,106.698,4.4,9800,98,du lịch;mua sắm;biểu tượng
POI003,Vincom Center Đồng Khởi,Trung tâm thương mại,Vincom,"72 Lê Thánh Tôn, Quận 1, TP.HCM",TP.HCM,10.7781,106.702,4.5,6500,96,mua sắm;ăn uống;giải trí
POI004,ATM Vietcombank Nguyễn Huệ,ATM,Vietcombank,"Nguyễn Huệ, Quận 1, TP.HCM",TP.HCM,10.7751,106.7035,4.1,310,75,atm;ngân hàng;24/7
POI005,Bệnh viện Bạch Mai,Bệnh viện,,"78 Giải Phóng, Đống Đa, Hà Nội",Hà Nội,21.0018,105.8412,4.1,3200,92,y tế;cấp cứu;bệnh viện
POI010,Khách sạn Mường Thanh Đà Nẵng,Khách sạn,Mường Thanh,"270 Võ Nguyên Giáp, Sơn Trà, Đà Nẵng",Đà Nẵng,16.061,108.2446,4.1,1950,84,khách sạn;gần biển;hồ bơi
`,
  [DATA_FILES.popularQueries]: `query_id,query_text,intent_type,monthly_frequency,region
PQ001,quán cà phê gần đây,Category Search,12000,TP.HCM
PQ002,atm vcb gần nhất,Nearby Search,8900,Đà Nẵng
PQ003,chợ bến thành,POI Search,15000,Hà Nội
PQ004,khách sạn đà nẵng gần biển,Discovery Search,7600,TP.HCM
PQ005,cây xăng gần đây,Nearby Search,9800,Đà Nẵng
`,
  [DATA_FILES.evaluation]: `case_id,input_prefix,expected_suggestion_type,expected_top_suggestions,difficulty,skills_tested
PUB001,vin,Brand Suggestions,Vincom Center; Vinmec; Vinpearl,Easy,Brand Suggestion; Ranking
PUB002,cafe,Category Suggestions,Quán cà phê gần đây; Highlands Coffee; Cà phê mở cửa 24/7,Easy,Category; Intent Prediction
`,
  [DATA_FILES.readme]: `AI Maps Track 4: Autocomplete & Query Suggestions Dataset,
Mô tả,Bộ dữ liệu hackathon cho hệ thống tự động hoàn thành và gợi ý truy vấn bản đồ tiếng Việt.
`,
};

export const testDataset = buildDatasetFromCsvs(testCsvs);
