"""Explicit cleanup of old recovery/evidence directories; normal backups stay."""
import argparse
from datetime import datetime
from pathlib import Path
import re
import shutil
import time


def latest_change(path):
    return max([path.stat().st_mtime]+[p.stat().st_mtime for p in path.iterdir() if not p.is_symlink()])


def candidates(root,keep=3,days=7,now=None):
    root=Path(root).resolve(strict=True)
    cutoff=(time.time() if now is None else now)-days*86400
    backups=root/'backups'
    previous=[]
    if backups.is_dir() and not backups.is_symlink():
        previous=[p for p in backups.iterdir() if p.is_dir() and not p.is_symlink() and re.fullmatch(r'pre_restore_\d{8}_\d{6}(?:_[A-Za-z0-9]+)?',p.name)]
    previous.sort(key=latest_change,reverse=True)
    evidence=[p for p in root.iterdir() if p.is_dir() and not p.is_symlink() and re.fullmatch(r'\.backup-work\.[A-Za-z0-9]+',p.name)]
    return [p for p in previous[keep:]+evidence if latest_change(p)<cutoff]


def remove_candidate(root,path,keep=3,days=7):
    root=Path(root).resolve(strict=True)
    path=Path(path)
    if path.is_symlink() or path.resolve(strict=True) not in candidates(root,keep,days):
        raise ValueError('Cleanup target changed or is no longer eligible.')
    resolved=path.resolve(strict=True)
    resolved.relative_to(root)
    if resolved.parent not in (root,root/'backups'):
        raise ValueError('Unexpected cleanup parent directory.')
    shutil.rmtree(resolved)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root')
    parser.add_argument('--language',choices=['de','en'],default='de')
    args=parser.parse_args()
    def message(en,de):return en if args.language=='en' else de
    root=Path(args.root).resolve(strict=True)
    paths=candidates(root)
    print(message('Normal backups and the newest three pre-restore backups are retained.','Reguläre Backups und die neuesten drei Vorzustandssicherungen bleiben erhalten.'))
    print(message('Only recovery/evidence directories unchanged for at least 7 days are listed.','Angezeigt werden nur seit mindestens 7 Tagen unveränderte Wiederherstellungs- und Prüfverzeichnisse.'))
    print(message('Review failed restores before removing their evidence. Staging directories are excluded.','Fehlgeschlagene Wiederherstellungen vor dem Löschen ihrer Belege prüfen. Temporäre Restore-Verzeichnisse bleiben ausgeschlossen.'))
    for index,path in enumerate(paths,1):print(f'[{index}] {path.relative_to(root)}')
    if not paths:return
    try:
        choice=input(message('Directory number to remove [Enter = cancel]: ','Nummer des zu löschenden Verzeichnisses [Enter = abbrechen]: ')).strip()
        if not choice:return
        if not choice.isdecimal() or not 1<=int(choice)<=len(paths):raise ValueError(message('Invalid selection.','Ungültige Auswahl.'))
        path=paths[int(choice)-1]
        print(message('Remove permanently: ','Dauerhaft löschen: ')+str(path.relative_to(root)))
        if input(message('Confirm with DELETE: ','Mit DELETE bestätigen: ')).strip()!='DELETE':return
        remove_candidate(root,path)
        print(message('Removed selected directory.','Ausgewähltes Verzeichnis gelöscht.'))
    except EOFError:return


if __name__=='__main__':
    try:main()
    except (OSError,ValueError) as error:raise SystemExit(str(error))
