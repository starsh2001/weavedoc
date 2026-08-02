#!/usr/bin/env bash
# Side-by-side table for the two fid_body readers (shipped vs candidate), fed the SAME input list.
# Rule §3-⑤ of the handoff: when two functions judge one concept, feed them one list and compare.
#   bash notes/fidtest.sh
set -u

SIB='Findings|Adjudications|Human queue'

nocomment() {
  awk '
    { line=$0
      while (1) {
        if (inc) { i=index(line,"-->"); if (i==0) { line=""; break }; line=substr(line,i+3); inc=0 }
        i=index(line,"<!--"); if (i==0) break
        rest=substr(line,i+4); j=index(rest,"-->")
        if (j==0) { line=substr(line,1,i-1); inc=1; break }
        line=substr(line,1,i-1) substr(rest,j+3)
      }
      print line
    }'
}

# ---- shipped (ffd940d) -------------------------------------------------------
old() {
  nocomment < "$1" | awk -v sib="$SIB" '
    !on && $0 ~ /^#{1,6}[[:space:]]+Fidelity violations[[:space:]]*$/ { on=1; lvl=length($1); next }
    on && /^#{1,6}[[:space:]]/ {
      hl=length($1); ht=$0; sub(/^#+[[:space:]]+/,"",ht); sub(/[[:space:]]+$/,"",ht)
      if (hl<=lvl) exit
      if (sib!="" && ht ~ ("^(" sib ")$")) exit
      next
    }
    on { print }'
}

# ---- candidate ---------------------------------------------------------------
new() {
  nocomment < "$1" | awk -v sib="$SIB" '
    function hlev(s){ if(match(s,/^#+/)) return RLENGTH; return 0 }
    function htext(s,   t){ t=s; sub(/^#+[[:space:]]+/,"",t); sub(/[[:space:]]+$/,"",t); return t }
    { L[NR]=$0 }
    END {
      tier=0
      for(i=1;i<=NR;i++){
        if(L[i] !~ /^#{1,6}[[:space:]]/) continue
        if(sib=="" || htext(L[i]) !~ ("^(" sib ")$")) continue
        if(tier==0 || hlev(L[i])<tier) tier=hlev(L[i])
      }
      for(i=1;i<=NR;i++){
        if(!on){ if(L[i] ~ /^#{1,6}[[:space:]]+Fidelity violations[[:space:]]*$/){ on=1; lvl=hlev(L[i]) } ; continue }
        if(L[i] ~ /^#{1,6}[[:space:]]/){
          if(hlev(L[i])<=lvl) break
          if(sib!="" && htext(L[i]) ~ ("^(" sib ")$") && hlev(L[i])<=tier) break
          continue
        }
        print L[i]
      }
    }'
}

D=${TMPDIR:-/tmp}/fidtest; rm -rf "$D"; mkdir -p "$D"

mk() { name=$1; shift; printf '%s\n' "$@" > "$D/$name"; }

# 1 — normal template, empty section
mk c1_normal_empty '# Fidelity violations' '' '# Findings' '' '- [critical] 2장 — 약함' '' '# Adjudications' '' '# Human queue'
# 2 — normal template, one open violation
mk c2_normal_open '# Fidelity violations' '' '- [contradiction] 3장 — t001과 모순' '' '# Findings' '' '# Adjudications' '' '# Human queue'
# 3 — siblings at ##, violations at #, empty  (the .11 bug: must not swallow the findings)
mk c3_sib2_empty '# Fidelity violations' '' '## Findings' '' '- [critical] 2장 — 약함' '' '## Adjudications' '' '## Human queue'
# 4 — siblings at ##, violations at #, one open violation
mk c4_sib2_open '# Fidelity violations' '' '- [contradiction] 3장 — t001과 모순' '' '## Findings' '' '## Adjudications' '' '## Human queue'
# 5 — siblings at #, a sibling NAME planted one level deeper INSIDE the section  (bug ①)
mk c5_planted_l2 '# Fidelity violations' '' '## Findings' '' '- [contradiction] 3장 — t001과 모순' '' '# Findings' '' '# Adjudications' '' '# Human queue'
# 6 — same, level 3, Human queue
mk c6_planted_l3 '# Fidelity violations' '' '### Human queue' '' '- [contradiction] 3장 — t001과 모순' '' '# Findings' '' '# Adjudications' '' '# Human queue'
# 7 — a genuine sub-heading inside the section (closed in .11, must stay closed)
mk c7_subheading '# Fidelity violations' '' '## round 2' '' '- [contradiction] 3장 — t001과 모순' '' '# Findings' '' '# Adjudications' '' '# Human queue'
# 8 — siblings at ##, violations at #, planted `## Findings` inside: level cannot separate this
#     from c3. Residual after the tier rule; the file-wide census is what closes it.
mk c8_ambiguous '# Fidelity violations' '' '## Findings' '' '- [contradiction] 3장 — t001과 모순' '' '## Adjudications' '' '## Human queue'
# 9 — no sibling sections at all
mk c9_lonely '# Fidelity violations' '' '- [contradiction] 3장 — t001과 모순'
# 10 — archived history in a closed comment
mk c10_comment '# Fidelity violations' '' '<!--' '- [contradiction] 해소됨' '-->' '' '# Findings' '' '# Adjudications' '' '# Human queue'
# 11 — violations section at ##, siblings at #
mk c11_v2_sib1 '# Findings' '' '## Fidelity violations' '' '- [contradiction] 3장 — t001과 모순' '' '# Adjudications' '' '# Human queue'

kind() { grep -cE '^[[:space:]]*- \[[<{]?(contradiction|unsupported|missing-required)[>}]?\]' || true; }

printf '%-18s %-28s %-28s %s\n' case shipped candidate expected
for f in "$D"/c*; do
  n=$(basename "$f")
  o=$(old "$f" | kind); c=$(new "$f" | kind)
  case "$n" in
    *_empty)   exp=0 ;;
    c8_*)      exp=1 ;;
    c10_*)     exp=0 ;;
    *)         exp=1 ;;
  esac
  ov="entries=$o"; cv="entries=$c"
  m=" "
  [ "$c" != "$exp" ] && m="  <-- candidate wrong"
  printf '%-18s %-28s %-28s %s%s\n' "$n" "$ov" "$cv" "$exp" "$m"
done
