import os
G={'__name__':'__main__','__file__':os.path.abspath('scripts/_build_committee_deck.py')}
for part in ['_build_committee_deck.py','_deck_p3.py','_deck_p4.py','_deck_p5.py']:
    exec(compile(open('scripts/'+part,encoding='utf-8').read(),'scripts/'+part,'exec'),G)
