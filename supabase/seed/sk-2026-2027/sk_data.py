# Transkripsi SK 390 (Pembagian Tugas Guru dalam Pembelajaran, Semester 1 TA 2026/2027). Format: (kode, nama, jjm_tertulis, [(mapel, tingkat, kelas, jm)])
# kelas: daftar kode rombel, atau 'SEMUA'. jm = jumlah jam untuk seluruh kelas dalam baris itu.
TE='TE1,TE2'; TP='TP1,TP2'; TO='TO1,TO2'; TJ='TJKT1,TJKT2,TJKT3'; BP2='BP1,BP2'; BP3='BP1,BP2,BP3'
DDTE='Dasar-Dasar Teknik Elektronika'; DDTM='Dasar-Dasar Teknik Mesin'; DDTO='Dasar-Dasar Teknik Otomotif'
DDTJ='Dasar-Dasar Teknik Jaringan Komputer dan Telekomunikasi'; DDBP='Dasar-Dasar Broadcasting dan Perfilman'
TEK='Teknik Elektronika'; TPM='Teknik Pemesinan'; TKR='Teknik Kendaraan Ringan'; TKJ='Teknik Komputer dan Jaringan'; PF='Produksi Film'
KIK='Kreativitas, Inovasi, dan Kewirausahaan'; MP='Mata Pelajaran Pilihan'
PAI='Pendidikan Agama Islam dan Budi Pekerti'; PANC='Pendidikan Pancasila'; BIND='Bahasa Indonesia'; BING='Bahasa Inggris'
MTK='Matematika'; PJOK='Pendidikan Jasmani, Olahraga, dan Kesehatan'; SEJ='Sejarah'; INF='Informatika'; IPAS='Projek IPAS'
SUNDA='Bahasa Sunda'; SENI='Seni Budaya'; KARA='Seni Musik Karawitan Sunda'
GURU = [
 (1,'Tumiyanta, M.Pd',None,[]),
 (2,'Kusnadi, S.T',34,[(DDTE,10,TE,8),(TEK,11,TE,12),(TEK,12,TE,14)]),
 (3,'Imas Samsiah, S.Pd',32,[(DDTE,10,TE,8),(TEK,11,TE,12),(TEK,12,TE,12)]),
 (4,'Ujang Ridwan Maulana, S.T., M.Pd',15,[(KIK,12,TJ,15)]),
 (5,'Jaman Marpaung, S.Pd',36,[(TEK,12,TE,4),(KIK,11,TE,6),(KIK,12,TE,10),(MP,11,TE,8),(MP,12,TE,8)]),
 (6,'Arif Budiman, S.T',36,[(DDTM,10,TP,24),(TPM,12,TP,8),(MP,11,'TP2',4)]),
 (7,'Rayuli, S.T',30,[(TKJ,11,'TJKT2',18),(TKJ,12,'TJKT1',12)]),
 (8,'Siti Hasanah HS, S.Pd',34,[(PANC,10,'TP1,TP2,TO1,TO2,TE1,TE2,TJKT1,TJKT2,TJKT3',18),(PANC,12,'TP1,TP2,TO1,TO2,TE1,TE2',12)]),
 (9,'Mansyur, S.T',38,[(SUNDA,10,TP,4),(TPM,11,TP,10),(TPM,12,TP,28)]),
 (10,'Kiki Mulyani, S.Pd.Kons',None,[]),
 (11,'Sri Rahayu Ningsih, S.Kom',37,[(DDBP,10,BP2,16),(KIK,11,BP2,6),(KIK,12,BP3,15)]),
 (12,'Nuning Setiawati, S.S',36,[(BIND,11,'TP1,TP2,TO1,TO2,BP1,BP2',18),(BIND,12,'TP1,TP2,TO1,TO2,TJKT1,TJKT2',18)]),
 (13,'Aryu Apendi, S.T',31,[(TKR,11,'TO2',9),(TKR,12,'TO1',22)]),
 (14,'Abdul Muttaqin, S.Pd.I',33,[(PAI,10,'TJKT2,TJKT3,BP1,BP2',12),(PAI,11,'TE1,TE2,TJKT1',9),(PAI,12,'TP1,TP2,TO1,TO2',12)]),
 (15,'Joko Prihanto, S.Kom',30,[(DDTJ,10,TJ,18),(TKJ,12,'TJKT3',12)]),
 (16,'Didi Suryadi, S.Pd',33,[(BIND,11,'TJKT1,TJKT2,TJKT3,TE1,TE2',15),(BIND,12,'TE1,TE2,TJKT3,BP1,BP2,BP3',18)]),
 (17,'Miftahudin, S.Pd.I',36,[(PAI,10,'TP1,TP2,TO1,TO2',12),(PAI,11,'TJKT2,TJKT3,TO1,TO2',12),(PAI,12,'TE1,TE2,TJKT1,TJKT2',12)]),
 (18,'Siti Zukhaeriyah, S.Pd.I',33,[(PAI,10,'TE1,TE2,TJKT1',9),(PAI,11,'TP1,TP2,BP1,BP2',12),(PAI,12,'TJKT3,BP1,BP2,BP3',12)]),
 (19,'Novalia Hutabarat, S.Kom',32,[(DDBP,10,BP2,8),(PF,11,BP2,12),(MP,11,TJ,12)]),
 (20,'Muhidin, S.T',35,[(DDTO,10,TO,12),(TKR,11,'TO1',9),(MP,11,'TO1',4),(KIK,12,TO,10)]),
 (21,'Rahmat Sunarya, S.T',34,[(DDTO,10,TO,12),(TKR,12,'TO2',22)]),
 (22,'Ayes Muharam, S.Kom',36,[(TKJ,11,'TJKT3',18),(TKJ,12,'TJKT3',10),(MP,12,'TJKT2,TJKT3',8)]),
 (23,'Adung Abdul Haer, S.T',36,[(TKR,11,TO,18),(MP,11,'TO2',4),(KIK,11,TO,6),(MP,12,TO,8)]),
 (24,'Bangkit Ismoyo, S.T',32,[(PF,11,BP2,12),(MP,11,BP2,8),(MP,12,BP3,12)]),
 (25,'Herman Hardiansyah, S.Si',36,[(PF,11,BP2,12),(PF,12,BP3,24)]),
 (26,'Sri Sumarni, S.Pd',35,[(MTK,10,TP,8),(MTK,11,'TJKT1,TJKT2,TJKT3,BP1,BP2',15),(MTK,12,'TE1,TE2,TJKT1,TJKT2',12)]),
 (27,'Mohamad Syahroni, S.Pd',28,[(PJOK,10,TP,6),(PJOK,11,'SEMUA',22)]),
 (28,'Andika Pratama, S.Kom',27,[(INF,10,TJ,12),(PF,12,BP3,15)]),
 (29,'Irfan Abdul Gaffar Siddiq, S.Pd',30,[(IPAS,10,TJ,18),(MTK,12,'TJKT3,BP1,BP2,BP3',12)]),
 (30,'Selvi Zanita Putri, S.Pd',34,[(DDTE,10,TE,8),(TEK,11,TE,12),(TEK,12,TE,14)]),
 (31,'Yesri Hilal, S.Sn',44,[(SENI,10,'SEMUA',22),(KARA,11,'SEMUA',22)]),
 (32,'Syaiful Amri, S.T., M.M',27,[(PF,12,BP3,27)]),
 (33,'Siti Jamilah, S.Pd',40,[(BING,10,'TP1,TP2,TO1',12),(BING,11,'TE1,TE2,BP1,BP2',16),(BING,12,'TP1,TP2,TO1',12)]),
 (34,'Alin Yuliandari, S.Pd',38,[(MTK,10,TO,8),(MTK,11,'TP1,TP2,TO1,TO2,TE1,TE2',18),(MTK,12,'TP1,TP2,TO1,TO2',12)]),
 (35,'Ariyanto, S.Kom',32,[(TKJ,11,'TJKT1',18),(TKJ,12,'TJKT1',10),(MP,12,'TJKT1',4)]),
 (36,'Wahidin, S.Pd',34,[(SEJ,11,'TP1,TP2,TO1,TO2',8),(PANC,10,BP2,4),(PANC,11,'SEMUA',22)]),
 (37,'Budi Setiawan, S.Pd',32,[(BIND,10,'TJKT1,TJKT2,TJKT3,BP1,BP2',20),(PANC,12,'TJKT1,TJKT2,TJKT3,BP1,BP2,BP3',12)]),
 (38,'Wawah Munawaroh, S.E',34,[(SUNDA,10,'TO1,TO2,TE1,TE2,BP1,BP2',12),(SEJ,10,'SEMUA',22)]),
 (39,'Endi, S.Pd',36,[(SEJ,11,'TE1,TE2,TJKT1,TJKT2,TJKT3,BP1,BP2',14),(KIK,11,'SEMUA',22)]),
 (40,'Suryanto, S.Pd',32,[(BING,11,'TP1,TP2,TJKT1,TJKT2,TJKT3',20),(BING,12,TJ,12)]),
 (41,'Siti Nurhasanah, S.Pd',30,[(IPAS,10,'TP1,TP2,TO1,TO2',24),(SUNDA,10,TJ,6)]),
 (42,'Sawitri Rosdiarti, S.Pd',24,[(IPAS,10,'TE1,TE2,BP1,BP2',24)]),
 (43,'Jois Mayasari, S.Pd',28,[(MTK,10,'TE1,TE2,TJKT1,TJKT2,TJKT3,BP1,BP2',28)]),
 (44,'Riki Rusmana, S.Pd',32,[(BING,10,'TJKT1,TJKT2,TJKT3,BP1,BP2',20),(BING,12,BP3,12)]),
 (45,'Agung Suhantoro, S.T',32,[(TPM,11,TP,8),(TPM,12,TP,8),(KIK,11,TP,6),(KIK,12,TP,10)]),
 (46,'Kusno Rahayu, S.Pd',27,[(PJOK,10,'TO1,TO2,TE1,TE2,TJKT1,TJKT2,TJKT3,BP1,BP2',27)]),
 (47,'Imas Pebrianti Putri, S.Pd',32,[(BING,10,'TO2,TE1,TE2',12),(BING,11,TO,8),(BING,12,'TO2,TE1,TE2',12)]),
 (48,'Kurniawan, S.Kom, M.Kom',24,[(INF,10,'TP1,TP2,TO1,TO2,TE1,TE2',24)]),
 (49,'Helmy Zatmika, S.Kom',31,[(TKJ,12,'TJKT2',22),(KIK,11,TJ,9)]),
 (50,'Rafika Insani Rahesi, S.Pd',24,[(BIND,10,'TP1,TP2,TO1,TO2,TE1,TE2',24)]),
 (51,'Dadi Janenudin, S.Kom',26,[(DDTJ,10,TJ,18),(INF,10,BP2,8)]),
 (52,'M. Risky Sabarudin, S.Pd',30,[(TPM,11,TP,18),(MP,11,'TP1',4),(MP,12,TP,8)]),
 (53,'Rairini, S.Psi',None,[]),
]
ROMBEL = {10:['TP1','TP2','TO1','TO2','TE1','TE2','TJKT1','TJKT2','TJKT3','BP1','BP2'],
          11:['TP1','TP2','TO1','TO2','TE1','TE2','TJKT1','TJKT2','TJKT3','BP1','BP2'],
          12:['TP1','TP2','TO1','TO2','TE1','TE2','TJKT1','TJKT2','TJKT3','BP1','BP2','BP3']}
def kelas(t, s): return ROMBEL[t] if s=='SEMUA' else s.split(',')
