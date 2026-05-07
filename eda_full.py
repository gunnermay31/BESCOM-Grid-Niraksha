"""BESCOM EV Charging EDA — Full Analysis"""
import pandas as pd, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt, seaborn as sns
from pathlib import Path; import warnings, json
warnings.filterwarnings('ignore')

B = Path("/Volumes/DATA/Karnataka govt /EV optimization and detection /Github/EDA by google antigravity ")
OUT = B / "charts"; OUT.mkdir(exist_ok=True)
sns.set_theme(style="darkgrid"); plt.rcParams.update({'figure.dpi':150,'savefig.bbox':'tight','font.size':9})

# ═══ LOAD DATA ═══
print("Loading data...")
load = pd.read_excel(B/"kptcl_load_curve_2024_merged.xlsx", engine='openpyxl')
outage = pd.read_excel(B/"karnataka_ev_2024_outages 2.xlsx", engine='openpyxl')
print(f"  Load: {len(load)} rows | Outage: {len(outage)} rows")

# Clean outage
outage['date'] = pd.to_datetime(outage['date'], format='mixed', dayfirst=True, errors='coerce')
outage['month'] = outage['date'].dt.month
outage['day_of_week'] = outage['date'].dt.dayofweek
outage['is_weekend'] = outage['day_of_week'].isin([5,6])

# Parse times
def parse_hm(t):
    try:
        s = str(t).strip()
        if ':' in s: return int(s.split(':')[0])
    except: pass
    return np.nan
outage['opened_hour'] = outage['opened_at'].apply(parse_hm)
outage['opened_hour'] = pd.to_numeric(outage['opened_hour'], errors='coerce')
outage.loc[outage['opened_hour'] >= 24, 'opened_hour'] = np.nan
outage['opened_hour'] = outage['opened_hour'].astype('Int64')  # Nullable integer

def parse_dur(d):
    try:
        s = str(d).strip()
        if ':' in s:
            p = s.split(':')
            return int(p[0])*60 + int(p[1])
    except: pass
    return np.nan
outage['duration_min'] = outage['duration'].apply(parse_dur)

# Classify outage type from remarks
def classify(r):
    r = str(r).upper()
    if 'TRIPPED' in r or 'FAULT' in r: return 'Forced'
    if 'LINE CLEAR' in r: return 'Planned'
    if 'CURTAIL' in r: return 'Load Curtailment'
    if 'MAIN SUPPLY' in r: return 'Supply Failure'
    return 'Other'
outage['outage_type'] = outage['remarks'].apply(classify)

# Normalize zones
zone_map = {'BANGALORE':'BENGALURU','BENGALORE':'BENGALURU','BENGALURU LINE':'BENGALURU',
            'BENGALURU TRANSFORMER':'BENGALURU','BAGALKOT':'BAGALKOTE','BAGALKOTE LINE':'BAGALKOTE',
            'BAGALKOTE TRANSFORMER':'BAGALKOTE','HASAN':'HASSAN','HASSAN LINE':'HASSAN',
            'HASSAN TRANSFORMER':'HASSAN','TUMKUR LINE':'TUMKUR','TUMKUR TRANSFORMER':'TUMKUR',
            'MYSORE LINE':'MYSORE','MYSORE TRANSFORMER':'MYSORE'}
outage['zone'] = outage['transmission_zone'].map(lambda x: zone_map.get(str(x).strip(), str(x).strip()))

stats = {'total_outages': len(outage), 'total_load_hours': len(load),
         'outage_date_range': f"{outage['date'].min()} to {outage['date'].max()}",
         'zones': list(outage['zone'].dropna().unique()),
         'avg_duration_min': round(outage['duration_min'].mean(),1),
         'median_duration_min': round(outage['duration_min'].median(),1),
         'avg_peak_load_mw': round(load['load_mw'].max(),0)}
with open(OUT/'stats.json','w') as f: json.dump(stats, f, indent=2, default=str)
print(f"  Stats saved. Zones: {stats['zones']}")

# ═══ CHART 1: Outage Type Distribution ═══
fig, (a1,a2) = plt.subplots(1,2,figsize=(13,5))
ot = outage['outage_type'].value_counts()
c = ['#e74c3c','#2ecc71','#f39c12','#3498db','#9b59b6']
ot.plot(kind='bar',ax=a1,color=c[:len(ot)],edgecolor='k',lw=.3)
a1.set_title('Outage Events by Type (53.5K events)',fontweight='bold')
for i,v in enumerate(ot): a1.text(i,v+200,str(v),ha='center',fontsize=8,fontweight='bold')
a1.tick_params(axis='x',rotation=20)
ot.plot(kind='pie',ax=a2,autopct='%1.1f%%',colors=c[:len(ot)],startangle=90)
a2.set_title('Outage Type Share'); a2.set_ylabel('')
plt.tight_layout(); plt.savefig(OUT/'01_outage_types.png'); plt.close()
print("  ✓ 01")

# ═══ CHART 2: Hourly Outage Pattern ═══
fig, ax = plt.subplots(figsize=(14,6))
hr = outage.groupby('opened_hour').size().reindex(range(24),fill_value=0)
colors = ['#1a5276' if h<6 else '#e74c3c' if 18<=h<22 else '#f39c12' if 10<=h<16 else '#3498db' for h in range(24)]
ax.bar(range(24),hr.values,color=colors,edgecolor='w',lw=.5)
ax.axvspan(-.5,5.5,alpha=.08,color='green',label='✅ Best EV Charging (00-06)')
ax.axvspan(17.5,21.5,alpha=.08,color='red',label='⚠️ Avoid Charging (18-22)')
ax.set_title('⚡ Hourly Outage Pattern — EV Charging Schedule Guide',fontsize=13,fontweight='bold')
ax.set_xlabel('Hour'); ax.set_ylabel('Outage Count'); ax.set_xticks(range(24)); ax.legend(fontsize=9)
for i,v in enumerate(hr): ax.text(i,v+30,str(v),ha='center',fontsize=6)
plt.tight_layout(); plt.savefig(OUT/'02_hourly_outages.png'); plt.close()
print("  ✓ 02")

# ═══ CHART 3: Zone-wise Analysis ═══
fig, (a1,a2) = plt.subplots(1,2,figsize=(14,6))
zc = outage['zone'].value_counts().head(8)
zc.plot(kind='barh',ax=a1,color=plt.cm.Set2(np.linspace(0,1,len(zc))),edgecolor='k',lw=.3)
a1.set_title('Outages by Transmission Zone',fontweight='bold'); a1.invert_yaxis()
for i,v in enumerate(zc): a1.text(v+50,i,str(v),va='center',fontsize=8)

# Zone × type stacked
zt = outage.groupby(['zone','outage_type']).size().unstack(fill_value=0)
zt = zt.loc[zc.index]
zt.plot(kind='barh',stacked=True,ax=a2,color=c)
a2.set_title('Zone × Outage Type',fontweight='bold'); a2.invert_yaxis(); a2.legend(fontsize=7)
plt.tight_layout(); plt.savefig(OUT/'03_zone_analysis.png'); plt.close()
print("  ✓ 03")

# ═══ CHART 4: Duration Distribution ═══
fig, (a1,a2) = plt.subplots(1,2,figsize=(14,5))
vd = outage[outage['duration_min'].between(1,500)]
a1.hist(vd['duration_min'],bins=60,color='#3498db',edgecolor='w',alpha=.8)
a1.axvline(vd['duration_min'].median(),color='red',ls='--',label=f"Median: {vd['duration_min'].median():.0f}m")
a1.set_title('Outage Duration Distribution',fontweight='bold'); a1.legend()
sns.boxplot(data=vd,x='outage_type',y='duration_min',ax=a2,palette=c)
a2.set_title('Duration by Type',fontweight='bold'); a2.tick_params(axis='x',rotation=15)
plt.tight_layout(); plt.savefig(OUT/'04_duration.png'); plt.close()
print("  ✓ 04")

# ═══ CHART 5: Voltage Class ═══
fig, (a1,a2) = plt.subplots(1,2,figsize=(14,5))
vc = outage['voltage_class'].value_counts().sort_index()
vc.plot(kind='bar',ax=a1,color=['#2ecc71','#3498db','#e74c3c','#9b59b6'],edgecolor='k')
a1.set_title('Outages by Voltage Class (kV)',fontweight='bold')
for i,v in enumerate(vc): a1.text(i,v+100,str(v),ha='center',fontweight='bold')
sns.violinplot(data=outage[outage['duration_min'].between(1,500)],x='voltage_class',y='duration_min',ax=a2,palette='Set2',inner='box')
a2.set_title('Duration by Voltage Class',fontweight='bold')
plt.tight_layout(); plt.savefig(OUT/'05_voltage.png'); plt.close()
print("  ✓ 05")

# ═══ CHART 6: Monthly Outage Trend ═══
fig, ax = plt.subplots(figsize=(14,6))
mo = outage.groupby('month').agg(total=('date','size'),forced=('outage_type',lambda x:(x=='Forced').sum()))
mo = mo.reindex(range(1,13),fill_value=0)
ml = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
x = list(range(1,13))
ax.bar(x,mo['total'].values,color='#3498db',alpha=.6,label='Total')
ax.bar(x,mo['forced'].values,color='#e74c3c',alpha=.8,label='Forced')
ax.set_title('Monthly Outage Count 2024',fontsize=13,fontweight='bold')
ax.set_xticks(x); ax.set_xticklabels(ml); ax.legend()
for i,v in enumerate(mo['total']): ax.text(i+1,v+50,str(v),ha='center',fontsize=7)
plt.tight_layout(); plt.savefig(OUT/'06_monthly_outages.png'); plt.close()
print("  ✓ 06")

# ═══ CHART 7: Day×Hour Heatmap ═══
fig, ax = plt.subplots(figsize=(16,6))
hm = outage.groupby(['day_of_week','opened_hour']).size().unstack(fill_value=0)
hm = hm.reindex(range(7)).reindex(columns=range(24),fill_value=0)
hm.index = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
sns.heatmap(hm,cmap='YlOrRd',annot=True,fmt='d',lw=.5,ax=ax,annot_kws={'size':6},cbar_kws={'label':'Count'})
ax.set_title('🔥 Outage Heatmap (Day × Hour) — EV Scheduling Optimizer',fontsize=14,fontweight='bold')
plt.tight_layout(); plt.savefig(OUT/'07_heatmap.png'); plt.close()
print("  ✓ 07")

# ═══ CHART 8: Weekend vs Weekday ═══
fig, (a1,a2) = plt.subplots(1,2,figsize=(14,5))
for lbl,msk,col in [('Weekday',~outage['is_weekend'],'#3498db'),('Weekend',outage['is_weekend'],'#e74c3c')]:
    h = outage[msk].groupby('opened_hour').size().reindex(range(24),fill_value=0)
    a1.plot(range(24),h,marker='o',ms=3,lw=2,color=col,label=lbl)
a1.set_title('Hourly: Weekday vs Weekend',fontweight='bold'); a1.legend(); a1.set_xticks(range(24))
dn = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
dw = outage['day_of_week'].value_counts().sort_index()
dw.index = dn
dw.plot(kind='bar',ax=a2,color=['#3498db']*5+['#e74c3c']*2,edgecolor='k',lw=.3)
a2.set_title('By Day of Week',fontweight='bold'); a2.tick_params(axis='x',rotation=30)
plt.tight_layout(); plt.savefig(OUT/'08_weekday.png'); plt.close()
print("  ✓ 08")

# ═══ CHART 9: BENGALURU Focus (BESCOM territory) ═══
blr = outage[outage['zone']=='BENGALURU']
fig, (a1,a2) = plt.subplots(1,2,figsize=(14,5))
bhr = blr.groupby('opened_hour').size().reindex(range(24),fill_value=0)
a1.bar(range(24),bhr,color=['#1a5276' if h<6 else '#e74c3c' if 18<=h<22 else '#f39c12' for h in range(24)],edgecolor='w')
a1.set_title(f'BENGALURU Hourly Outages (n={len(blr)})',fontweight='bold'); a1.set_xticks(range(24))
bm = blr.groupby('month').size().reindex(range(1,13),fill_value=0)
bm.index = ml
bm.plot(kind='bar',ax=a2,color='#e67e22',edgecolor='k',lw=.3)
a2.set_title('BENGALURU Monthly Trend',fontweight='bold'); a2.tick_params(axis='x',rotation=30)
plt.tight_layout(); plt.savefig(OUT/'09_bengaluru.png'); plt.close()
print("  ✓ 09")

# ═══ CHART 10: Top Outage Stations ═══
fig, ax = plt.subplots(figsize=(14,8))
ts = outage['line_transformer_affected'].value_counts().head(25)
ts.plot(kind='barh',ax=ax,color=plt.cm.RdYlGn_r(np.linspace(.2,.9,len(ts))),edgecolor='k',lw=.2)
ax.set_title('Top 25 Most Affected Lines/Transformers — EV Risk Zones',fontsize=12,fontweight='bold')
ax.invert_yaxis()
for i,v in enumerate(ts): ax.text(v+1,i,str(v),va='center',fontsize=7)
plt.tight_layout(); plt.savefig(OUT/'10_top_stations.png'); plt.close()
print("  ✓ 10")

# ═══ LOAD CURVE CHARTS ═══
print("\nLoad curve analysis...")

# ═══ CHART 11: Hourly Load Profile ═══
fig, ax = plt.subplots(figsize=(14,7))
lp = load.groupby('hour')['load_mw'].agg(['mean','std','min','max'])
ax.fill_between(lp.index,lp['min'],lp['max'],alpha=.12,color='#3498db',label='Min-Max Range')
ax.fill_between(lp.index,lp['mean']-lp['std'],lp['mean']+lp['std'],alpha=.25,color='#2980b9',label='±1σ')
ax.plot(lp.index,lp['mean'],color='#2c3e50',lw=3,marker='o',ms=6,label='Mean Load')
ax.axvspan(0,5.5,alpha=.07,color='green'); ax.axvspan(18,21.5,alpha=.07,color='red')
ax.annotate('✅ OPTIMAL EV\nCHARGING',xy=(2.5,lp['mean'].min()*.97),fontsize=10,fontweight='bold',color='#27ae60',ha='center')
ax.annotate('⚠️ PEAK\nAVOID',xy=(19.5,lp['mean'].max()*.97),fontsize=10,fontweight='bold',color='#c0392b',ha='center')
ax.set_title('⚡ Karnataka Hourly Load Profile 2024 — EV Charging Windows',fontsize=14,fontweight='bold')
ax.set_xlabel('Hour'); ax.set_ylabel('Load (MW)'); ax.set_xticks(range(24)); ax.legend(loc='lower right')
plt.tight_layout(); plt.savefig(OUT/'11_load_profile.png'); plt.close()
print("  ✓ 11")

# ═══ CHART 12: Annual Load Trend ═══
fig, ax = plt.subplots(figsize=(16,6))
daily = load.groupby('date')['load_mw'].agg(['max','min','mean']).reset_index()
ax.fill_between(daily['date'],daily['min'],daily['max'],alpha=.15,color='orange')
ax.plot(daily['date'],daily['max'],alpha=.4,color='#e74c3c',lw=.8)
ax.plot(daily['date'],daily['max'].rolling(7).mean(),color='#c0392b',lw=2.5,label='Peak 7d Avg')
ax.plot(daily['date'],daily['mean'].rolling(7).mean(),color='#2980b9',lw=2,label='Avg 7d')
ax.set_title('📊 Daily Load Trend 2024 — Grid Capacity for EV',fontsize=14,fontweight='bold')
ax.set_ylabel('Load (MW)'); ax.legend()
plt.tight_layout(); plt.savefig(OUT/'12_load_trend.png'); plt.close()
print("  ✓ 12")

# ═══ CHART 13: Monthly Box ═══
fig, ax = plt.subplots(figsize=(14,6))
mdata = [load[load['month']==m]['load_mw'].values for m in range(1,13)]
bp = ax.boxplot(mdata,labels=ml,patch_artist=True,notch=True)
for p,co in zip(bp['boxes'],plt.cm.RdYlGn_r(np.linspace(.2,.9,12))):
    p.set_facecolor(co); p.set_alpha(.7)
ax.set_title('Monthly Load Distribution — Seasonal EV Planning',fontsize=13,fontweight='bold')
ax.set_ylabel('Load (MW)')
plt.tight_layout(); plt.savefig(OUT/'13_monthly_box.png'); plt.close()
print("  ✓ 13")

# ═══ CHART 14: Weekday vs Weekend Load ═══
fig, ax = plt.subplots(figsize=(14,7))
for lbl,msk,col,mk in [('Weekday',~load['is_weekend'],'#3498db','o'),('Weekend',load['is_weekend'],'#e74c3c','s')]:
    p = load[msk].groupby('hour')['load_mw'].mean()
    ax.plot(p.index,p.values,color=col,marker=mk,ms=5,lw=2.5,label=f'{lbl} (μ={p.mean():.0f} MW)')
ax.axvspan(0,5.5,alpha=.06,color='green'); ax.axvspan(18,21.5,alpha=.06,color='red')
ax.set_title('Weekday vs Weekend Load — EV Charging Opportunity',fontsize=13,fontweight='bold')
ax.set_xticks(range(24)); ax.legend(fontsize=11)
plt.tight_layout(); plt.savefig(OUT/'14_wk_we_load.png'); plt.close()
print("  ✓ 14")

# ═══ CHART 15: EV Opportunity Heatmap (Month×Hour) ═══
fig, ax = plt.subplots(figsize=(16,8))
cap = load['load_mw'].quantile(.99)*1.1
piv = load.pivot_table(values='load_mw',index='month',columns='hour',aggfunc='mean')
spare = ((cap-piv)/cap*100).clip(lower=0)
sns.heatmap(spare,cmap='RdYlGn',annot=True,fmt='.0f',lw=.5,ax=ax,yticklabels=ml,annot_kws={'size':7},cbar_kws={'label':'Spare Capacity %'})
ax.set_title('🔋 EV Charging Opportunity (Month×Hour) — Green=Best Slots',fontsize=14,fontweight='bold')
plt.tight_layout(); plt.savefig(OUT/'15_ev_heatmap.png'); plt.close()
print("  ✓ 15")

# ═══ CHART 16: Spare Capacity ═══
fig, (a1,a2) = plt.subplots(2,1,figsize=(16,10))
daily['spare'] = cap - daily['max']
daily['spare_pct'] = daily['spare']/cap*100
a1.fill_between(daily['date'],0,daily['spare'],alpha=.4,color='#2ecc71')
a1.plot(daily['date'],daily['spare'],color='#27ae60',lw=1)
a1.axhline(cap*.1,color='red',ls='--',label='10% Threshold')
a1.set_title(f'🔋 Daily Spare Capacity for EV (Grid Cap ≈ {cap:.0f} MW)',fontsize=13,fontweight='bold')
a1.set_ylabel('Spare (MW)'); a1.legend()

hourly_spare = cap - lp['mean']
cols = ['#2ecc71' if s>cap*.15 else '#f39c12' if s>cap*.05 else '#e74c3c' for s in hourly_spare]
a2.bar(range(24),hourly_spare,color=cols,edgecolor='w')
a2.set_title('Hourly Avg Spare Capacity — EV Charging Slots',fontweight='bold')
a2.set_xticks(range(24)); a2.set_ylabel('Spare MW')
plt.tight_layout(); plt.savefig(OUT/'16_spare_cap.png'); plt.close()
print("  ✓ 16")

# ═══ CHART 17: YoY Load Growth ═══
fig, ax = plt.subplots(figsize=(14,6))
if 'yoy_load_change_pct' in load.columns:
    yoy = load.groupby('month')['yoy_load_change_pct'].mean()*100
    cols = ['#2ecc71' if v>0 else '#e74c3c' for v in yoy]
    ax.bar(range(1,13),yoy,color=cols,edgecolor='k',lw=.3)
    ax.set_title('Year-over-Year Load Growth (%) — EV Demand Forecast Input',fontsize=13,fontweight='bold')
    ax.set_xticks(range(1,13)); ax.set_xticklabels(ml); ax.set_ylabel('YoY Change (%)')
    ax.axhline(0,color='k',lw=.5)
plt.tight_layout(); plt.savefig(OUT/'17_yoy_growth.png'); plt.close()
print("  ✓ 17")

# ═══ CHART 18: Frequency ═══
fig, ax = plt.subplots(figsize=(14,6))
vf = load[(load['frequency_hz']>49)&(load['frequency_hz']<51)]
fp = vf.groupby('hour')['frequency_hz'].agg(['mean','std'])
ax.fill_between(fp.index,fp['mean']-fp['std'],fp['mean']+fp['std'],alpha=.3,color='#3498db')
ax.plot(fp.index,fp['mean'],color='#2c3e50',lw=2.5,marker='o')
ax.axhline(50,color='green',ls='--',alpha=.5,label='50 Hz Nominal')
ax.axhline(49.5,color='red',ls='--',alpha=.5,label='Low Warning')
ax.set_title('Grid Frequency Profile — Stability for EV Charging',fontsize=13,fontweight='bold')
ax.set_xticks(range(24)); ax.legend()
plt.tight_layout(); plt.savefig(OUT/'18_frequency.png'); plt.close()
print("  ✓ 18")

# ═══ CHART 19: Grid Stress Score ═══
fig, ax = plt.subplots(figsize=(14,6))
# Compute per-hour outage metrics
o_cnt = outage.groupby('opened_hour').size().reindex(range(24), fill_value=0)
o_forced = outage.groupby('opened_hour')['outage_type'].apply(lambda x:(x=='Forced').mean()).reindex(range(24), fill_value=0).fillna(0)
# Normalize each to 0-1
cnt_n = (o_cnt - o_cnt.min()) / (o_cnt.max() - o_cnt.min()) if o_cnt.max() > o_cnt.min() else 0
frc_n = (o_forced - o_forced.min()) / (o_forced.max() - o_forced.min()) if o_forced.max() > o_forced.min() else 0
load_n = (lp['mean'] - lp['mean'].min()) / (lp['mean'].max() - lp['mean'].min())
# Composite: 35% outage freq + 30% load level + 20% forced ratio + 15% inverse of night benefit
stress = (0.35 * cnt_n + 0.30 * load_n + 0.20 * frc_n + 0.15 * cnt_n * load_n) * 100
stress = stress.fillna(0)
cols = ['#2ecc71' if s<30 else '#f39c12' if s<55 else '#e74c3c' for s in stress]
ax.bar(range(24), stress, color=cols, edgecolor='w', lw=.5)
ax.set_title('⚡ Composite Grid Stress Score — EV Charging Safety Index', fontsize=14, fontweight='bold')
ax.set_xlabel('Hour of Day'); ax.set_ylabel('Stress Score (0-100)')
ax.set_xticks(range(24))
ax.axhline(30, color='green', ls='--', alpha=.5, label='Safe (<30)')
ax.axhline(55, color='red', ls='--', alpha=.5, label='High Risk (>55)')
ax.legend(loc='upper left', fontsize=9)
for i, v in enumerate(stress): ax.text(i, v+1.5, f'{v:.0f}', ha='center', fontsize=7, fontweight='bold')
plt.tight_layout(); plt.savefig(OUT/'19_stress.png'); plt.close()
print("  ✓ 19")

# ═══ CHART 20: Combined Load+Outage Overlay ═══
fig, ax1 = plt.subplots(figsize=(14,7))
ax2 = ax1.twinx()
ax1.plot(lp.index,lp['mean'],color='#2980b9',lw=3,marker='o',ms=5,label='Avg Load (MW)')
ax1.fill_between(lp.index,lp['mean'],alpha=.15,color='#3498db')
obar = outage.groupby('opened_hour').size().reindex(range(24),fill_value=0)
ax2.bar(range(24),obar,alpha=.3,color='#e74c3c',label='Outage Count')
ax1.set_xlabel('Hour'); ax1.set_ylabel('Load (MW)',color='#2980b9')
ax2.set_ylabel('Outage Count',color='#e74c3c')
ax1.set_title('⚡ Load Profile + Outage Overlay — EV Infrastructure Planning',fontsize=14,fontweight='bold')
ax1.set_xticks(range(24))
lines1,labels1=ax1.get_legend_handles_labels(); lines2,labels2=ax2.get_legend_handles_labels()
ax1.legend(lines1+lines2,labels1+labels2,loc='upper left')
plt.tight_layout(); plt.savefig(OUT/'20_load_outage_overlay.png'); plt.close()
print("  ✓ 20")

n = len(list(OUT.glob('*.png')))
print(f"\n{'='*50}\n  ✅ EDA Complete — {n} charts saved to {OUT}\n{'='*50}")
