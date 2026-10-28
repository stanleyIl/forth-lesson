"""Compatibility entry point for the Word-based lesson six report."""
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[1]
runpy.run_path(str(root / 'scripts' / 'generate-lesson6-illustrated-report.py'), run_name='__main__')
print('Word 原稿已生成。使用 Word 或 WPS 导出为 output/pdf/campusclaw-lesson-6-report.pdf。')
