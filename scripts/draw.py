import matplotlib.pyplot as plt
import numpy as np

# Data
categories = ['Complex Logic\nAccuracy', 'Hallucination\nFrequency', 'Code One-pass\nRate', 'Overall Output\nQuality']
standard_gemini = [65, 12, 55, 60]  # Normalizing quality to out of 100 for visual comparison
g_master = [92, 2, 88, 100]

x = np.arange(len(categories))  # the label locations
width = 0.35  # the width of the bars

fig, ax = plt.subplots(figsize=(10, 6))

# Plot bars
rects1 = ax.bar(x - width/2, standard_gemini, width, label='Standard Gemini', color='#CFD8DC')
rects2 = ax.bar(x + width/2, g_master, width, label='G-Master Deep Think', color='#FF9800')

# Add some text for labels, title and custom x-axis tick labels, etc.
ax.set_ylabel('Score (%)', fontsize=12)
ax.set_title('Performance Comparison: Standard Gemini vs G-Master', fontsize=14, pad=20)
ax.set_xticks(x)
ax.set_xticklabels(categories, fontsize=11)
ax.legend(fontsize=12)

# Auto-label bars
def autolabel(rects):
    """Attach a text label above each bar in *rects*, displaying its height."""
    for rect in rects:
        height = rect.get_height()
        ax.annotate(f'{height}%',
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3),  # 3 points vertical offset
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=10)

autolabel(rects1)
autolabel(rects2)

fig.tight_layout()

# Save the plot
plt.savefig('public/images/performance_comparison.png', dpi=300)
print("Plot saved to public/images/performance_comparison.png")
