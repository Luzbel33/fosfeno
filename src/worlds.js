// Each scene shares the same signal bus. Coordinates use half the canvas height as one unit.
const WORLDS = [
  { name: 'Serafín', family: 'Anatomía espectral', tint: '#f254b1' },
  { name: 'Catedral infinita', family: 'Arquitectura fractal', tint: '#ea9e52' },
  { name: 'Micelio eléctrico', family: 'Bioluminiscencia', tint: '#5cdec2' },
  { name: 'Nudo orbital', family: 'Topología de cromo', tint: '#b39af8' },
  { name: 'Río de mercurio', family: 'Fluido iridiscente', tint: '#70a7ff' },
  { name: 'Ojo abisal', family: 'Óptica recursiva', tint: '#e48166' }
]

const VERTEX = `
precision highp float;
attribute vec2 position;
varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}
`
const SHARED = `
precision highp float;
varying vec2 uv;
uniform vec2 size, pointer;
uniform vec3 sound;
uniform float clock, seed, energy, hue, impulse, fusion, symmetry, mediaAspect;
uniform sampler2D imageIn;
const float PI=3.14159265, TAU=6.28318531;
float sat(float x){return clamp(x,0.,1.);}
float sq(float x){return x*x;}
float softSign(float x){return 2./(1.+exp(-2.*x))-1.;}
float bell(float x){return exp(-x*x);}
float line(float x,float w){return exp(-abs(x)/w);}
mat2 spin(float t){return mat2(cos(t),sin(t),-sin(t),cos(t));}
float hash(vec2 p){vec3 v=fract(vec3(p.xyx)*.1031);v+=dot(v,v.yzx+33.33);return fract((v.x+v.y)*v.z);}
float noise2(vec2 p){
  vec2 f=fract(p),i=floor(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
vec3 film(float x){return .51+.49*cos(TAU*(x+vec3(.01,.33,.62)));}
vec3 alloy(float x){
  vec3 rose=vec3(.99,.055,.39), ice=vec3(.07,.87,.94), gold=vec3(1.,.55,.19);
  return mix(mix(rose,ice,smoothstep(-.48,.55,sin(x))),gold,.78*smoothstep(.32,.94,cos(x*.73+1.4)));
}
vec3 space(vec2 p,float t){
  vec2 q=p+vec2(t*.006,0.);
  float dust=noise2(q*3.)*.65+noise2(q*10.)*.23+noise2(q*32.)*.12;
  vec2 g=q*70.;float h=hash(floor(g));float star=bell(length(fract(g)-vec2(h,hash(floor(g)+14.)))*10.);
  return vec3(.008,.008,.033)+vec3(.052,.016,.1)*dust+vec3(.48,.67,.87)*star*step(.91,h)*(.4+dust);
}
vec2 mediaUV(vec2 coord){
  float a=size.x/size.y;
  return (coord-.5)*vec2(min(1.,a/mediaAspect),min(1.,mediaAspect/a))+.5;
}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
`

const SHADERS = [
  `
float faceZ(vec2 p){
  float x=abs(p.x),y=p.y;
  float w=.405*(.85+.13*softSign((y+.25)*5.));
  float z=sqrt(max(0.,1.-sq(x/w)-sq((y+.018)/.665)))*.31;
  z+=.123*bell(x/.044)*bell((y+.04)/.217)+.112*bell(x/.073)*bell((y+.178)/.059);
  z+=.045*bell((x-.062)/.032)*bell((y+.178)/.039);
  z-=.097*bell((x-.158)/.09)*bell((y-.083)/.062);
  z+=.078*bell((x-.165)/.098)*bell((y-.169+.26*(x-.16))/.051);
  z+=.069*bell((x-.215)/.085)*bell((y+.082)/.095);
  z+=.047*bell(x/.118)*bell((y+.327+.013*cos(x*34.))/.026);
  z+=.043*bell(x/.104)*bell((y+.37)/.024)+.044*bell(x/.098)*bell((y+.50)/.068);
  return z;
}
// Fiber bundles cross behind the mask. Their phase travels along each filament.
vec3 pinion(vec3 bg,vec2 p,float k,float t){
  float x=abs(p.x), u=(x-.16)/ (1.26+.27*sin(k*1.7+.6)+.09*sin(t*.23+k));
  if(u<=0.||u>=1.)return bg;
  float spread=pow(max(.0,sin(u*PI)),.77);
  float cy=.21-.175*k+(.64-.15*k)*u+.26*sin(PI*u*1.37+k*.4+.18*sin(t*.32))+.12*sin(u*TAU+k*.58);
  float width=spread*(.115+.022*cos(k)+.026*sound.y);
  float v=(p.y-cy)/max(.001,width), edge=1.-abs(v);
  float light=alloy(k*2.+u*10.+v*.8+seed+t*.16).r;
  vec3 c=alloy(k*1.43+u*10.4+v*1.9+seed+t*.16);
  float warp=v+.19*sin(u*8.+v*2.+k)+.08*sin(u*21.-v*3.+t*.32);
  float threads=pow(.5+.5*cos(warp*51.+u*16.+.5*sin(u*17.)),8.);
  float facets=pow(.5+.5*cos(warp*10.-u*13.),3.);
  float silk=.075+.62*threads+.37*facets;
  silk+=.22*threads*pow(.5+.5*cos(u*260.+v*3.),2.);
  bg+=c*.17*line(edge,.13)*spread;
  return mix(bg,c*silk+vec3(.7,.9,1.)*(.52*line(edge,.043)+.32*pow(facets,7.)*threads)*(.5+light),smoothstep(-.012,.025,edge));
}
vec3 iris(vec2 q,float lid,float t){
  float r=length(q),a=atan(q.y,q.x+.00001);
  vec3 c=mix(vec3(.15,.016,.12),vec3(.93,.55,.47),.25+.75*line(r-.59,.55));
  float fil=.5+.5*cos(52.*a+3.4*sin(9.*a)+9.*r+t*.33);
  c=mix(c,alloy(2.2+r*5.+seed)*(.4+.55*fil)+vec3(.18,.1,.02),1.-smoothstep(.56,.62,r));
  c=mix(c,vec3(.012,.004,.023),1.-smoothstep(.19+sound.x*.10,.24+sound.x*.10,r));
  c+=vec3(.95,.98,1.)*bell(length(q-vec2(-.18,.19))*11.);
  return c+vec3(1.,.35,.42)*.65*line(lid,.09);
}
vec3 world(vec2 p,float t){
  p*=1.02+.035*sin(t*.21+seed);
  p.x+=.012*sin(p.y*5.+t*.56);
  vec3 col=space(p,t);
  float x=abs(p.x),r=length(p),a=atan(p.y,p.x+.00001);
  // Receding fluted arches occupy the peripheral vision on a widescreen output.
  vec2 panel=vec2(x-.03,p.y+.48);
  float arc=length(panel*vec2(.60,1.05)),az=atan(panel.y,panel.x+.001);
  float shells=arc*7.2+.52*sin(az*6.+arc*3.-t*.16)+.12*sin(az*17.+seed);
  float fil=pow(.5+.5*cos(shells*TAU),16.);
  float wire=pow(.5+.5*cos(az*184.+arc*17.+1.8*sin(arc*14.-t*.24)),7.);
  float peripheral=smoothstep(.36,1.18,x)*(.35+.65*sq(sin(az*4.+arc)));
  col+=alloy(arc*4.+az*3.+seed)*peripheral*(.39*fil+.17*wire+.43*wire*fil);
  // Fine branching wavefronts travel outwards between the main bundles.
  float field=p.y+.15*sin(x*3.3-t*.28)+.25*cos(x*1.9+seed);
  float fan=field*22./(.45+x)+3.*sin(x*4.+field*3.+t*.12);
  col+=alloy(fan*.18+x)*.13*pow(.5+.5*cos(fan*4.),13.)*smoothstep(.32,1.,x)*exp(-1.1*abs(field));
  float halo=length(p*vec2(.86,1.));
  col+=vec3(.17,.02,.17)*exp(-1.5*r*r);
  for(int j=0;j<5;j++){
    float k=float(j),rr=halo-(.73+.085*k+.029*cos(a*(8.+2.*k)+t*.14+seed));
    col+=alloy(k+3.)*(line(rr,.0018)*.37+line(rr,.015)*.08)*(.32+.68*pow(abs(cos(a*(29.+k))),3.));
  }
  for(int i=0;i<6;i++)col=pinion(col,p,float(5-i),t);
  // The crown uses a radial loom whose quills follow the skull rather than a flat disk.
  vec2 crown=p-vec2(0.,.16);float ang=atan(crown.x,crown.y+.00001),cr=length(crown);
  float spoke=abs(fract(ang/TAU*76.+.16*sin(cr*15.-t*.31))-.5);
  float reach=.64+.18*cos(ang*9.)+.10*cos(ang*21.+seed);
  float feather=smoothstep(.36,.51,cr)*(1.-smoothstep(reach,reach+.015,cr))*smoothstep(-.06,.2,crown.y);
  col+=feather*alloy(ang*4.+cr*8.+t*.13)*(.16+.65*line(spoke,.065))*(.45+.55*sq(cos(cr*70.-ang*12.)));
  // Clavicles and a vertebral fan ground the floating head in its own anatomy.
  vec2 chest=vec2(x,p.y+.79);
  float clavicle=chest.y-.19*sin(x*4.)+.23*x;
  float body=exp(-x*x*3.8)*(1.-smoothstep(-.67+.17*min(1.,x),-.33+.17*min(1.,x),p.y));
  float vertebra=cos(chest.y*79.+4.*sin(x*6.9))+cos(x*34.+chest.y*12.);
  col+=alloy(x*8.+chest.y*4.+t*.12)*body*(.28*line(clavicle,.045)+.31*pow(.5+.25*vertebra,6.)+.28*line(x-.115-.10*chest.y,.007));
  vec2 f=p-vec2(.018*sin(t*.31),.0);
  f.x-=(.16+.13*sin(t*.25+seed))*faceZ(f);
  float fx=abs(f.x),fy=f.y,w=.405*(.85+.13*softSign((fy+.25)*5.));
  float mask=1.-sq(fx/w)-sq((fy+.018)/.665);
  if(mask>-.04){
    float z=faceZ(f);vec2 e=vec2(.0025,0.);
    vec3 n=normalize(vec3(faceZ(f-e)-faceZ(f+e),faceZ(f-e.yx)-faceZ(f+e.yx),.005));
    float sculpt=dot(n,normalize(vec3(-.47,.58,.65)));
    float vein=fy*31.+z*49.+fx*11.+1.8*sin(fx*17.+fy*6.+.3*sin(t*.32));
    float ribs=pow(.5+.5*cos(vein*2.9+seed),8.);
    float paths=pow(.5+.5*cos(atan(fx+.003,fy-.06)*18.+z*34.+1.4*sin(fy*32.)),10.);
    vec3 skin=alloy(z*19.+n.x*2.6+fy*4.+seed+t*.12);
    float mesh=pow(.5+.5*cos(vein*8.6+fx*27.),13.)*pow(.5+.5*cos(z*237.+fy*18.),6.);
    vec3 flesh=skin*(.065+.41*max(.0,sculpt)+.57*ribs+.21*paths)+vec3(.055,.012,.085)+vec3(.4,.65,.63)*mesh;
    float spec=pow(max(0.,dot(n,normalize(vec3(-.38,.38,.85)))),27.);
    flesh+=vec3(.98,.79,.7)*(.59*spec+.35*ribs*paths)+alloy(fy*7.)*.54*line(mask,.038);
    vec2 eye=vec2((fx-.157)/.102,(fy-.067-(fx-.157)*.26)/(.058+.011*sound.x));
    float lid=1.-abs(eye.y)-eye.x*eye.x;
    flesh+=vec3(.82,.11,.43)*line(lid,.22)*.43;
    if(lid>0.)flesh=iris(vec2(eye.x*1.65,eye.y),lid,t);
    vec2 third=vec2(f.x/.068,(fy-.336)/.1);float tl=1.-abs(third.x)-third.y*third.y;
    flesh+=vec3(1.,.38,.09)*.6*line(tl,.14);
    if(tl>0.)flesh=iris(third.yx*1.22,tl,t);
    flesh*=1.-.77*bell((fx-.045)/.018)*bell((fy+.193)/.012);
    flesh*=1.-.69*bell((fy+.346+.008*cos(fx*30.))/.007)*bell(fx/.10);
    col=mix(col,flesh,smoothstep(-.02,.018,mask));
  }
  return col;
}
`,
  `
vec3 world(vec2 p,float t){
  p=spin(.13*sin(t*.16+seed))*p;
  vec2 center=vec2(.23*sin(t*.27),.12*cos(t*.19));p-=center;
  float a=atan(p.y,p.x+.0001),r=length(p), dep=-log(max(.009,r));
  float fly=t*.29+seed;
  float w=dep+fly+.08*cos(a*8.+dep*1.7);
  vec3 col=space(p,t)*.6;
  for(int i=0;i<3;i++){
    float k=float(i),stage=floor(w*1.35+k*.333),z=fract(w*1.35+k*.333);
    float face=abs(fract(a/TAU*8.+.018*sin(t*.23+stage)+k*.125)-.5)*2.;
    float arch=.51+.37*sqrt(max(0.,1.-face*face));
    float vault=min(abs(z-arch),abs(face-.91)*.86);
    vec3 stone=alloy(1.2+stage*.68+k*.84+seed);
    vec3 metal=mix(vec3(.96,.42,.065),stone,.28+.21*sin(stage*.7));
    float ribs=line(vault,.018)+line(vault-.046,.012)*.53;
    vec2 glass=vec2(face-.5,z-.52)*2.1;
    float tracery=1.;
    for(int f=0;f<4;f++){
      glass=abs(glass)/clamp(dot(glass,glass),.23,1.8)-vec2(.81,.62);
      tracery=min(tracery,abs(length(glass)-.54));
    }
    float cut=pow(.5+.5*cos(face*45.+2.*cos(z*17.)),9.);
    float leaf=pow(.5+.5*cos(z*36.+3.*sin(face*11.)),8.);
    float gloom=(.35+.65*z)*(.3+.7*smoothstep(.01,.3,r));
    col+=gloom*(metal*(ribs*.83+.21*cut*leaf+.16*line(z-.08,.034))+stone*.17*line(vault,.09)+vec3(.22,.53,.83)*line(tracery,.023)*(.28+.4*leaf));
  }
  col+=vec3(.97,.39,.11)*.55*line(r,.105);return col;
}
`,
  `
vec3 world(vec2 p,float t){
  vec3 col=space(p,t)+vec3(.008,.055,.061)*exp(-length(p));
  // Layered bells and independently advected tentacles give the shoal parallax.
  for(int n=0;n<5;n++){
    float k=float(n),hero=step(3.9,k);
    vec2 pos=mix(vec2((k-1.5)*.94,.30*sin(k*5.+t*.2+seed)),vec2(.09*sin(t*.3),.07),hero);
    float sc=mix(.43+.13*cos(k*2.),1.01,hero);
    vec2 q=(p-pos)/sc;q=spin(.12*sin(k+t*.23))*q;
    float xx=q.x+.075*sin(q.y*5.+t*.52+k)*(1.-smoothstep(-.7,.2,q.y));
    float ax=abs(xx), y=q.y, flow=t*.58;
    float shell=length(vec2(xx/.60,(y-.10)/(.43+.03*sin(flow+k))))-1.;
    float rim=.095-.13*sq(xx/.60)+.028*cos(xx*28.+flow);
    vec3 cyan=mix(vec3(.035,.93,.77),vec3(.79,.25,.9),.5+.49*sin(xx*8.+k+seed));
    if(y>rim&&shell<0.){
      float depth=sqrt(max(.0,1.-sq(xx/.6)-sq((y-.1)/.46)));
      float channel=atan(xx,depth+.01)*24.+2.4*sin(y*13.+flow);
      float ribs=pow(.5+.5*cos(channel),7.);
      col=mix(col,cyan*(.15+.56*ribs+.20*sq(cos(y*31.+depth*8.)))+vec3(.41,.8,.71)*pow(depth,9.)*.4,.84);
    }
    col+=cyan*line(shell,.026)*smoothstep(rim-.02,rim+.05,y);
    col+=vec3(.67,1.,.74)*line(y-rim,.012)*(1.-smoothstep(.55,.62,ax));
    for(int j=0;j<15;j++){
      float v=(float(j)-7.)/7.;float d=max(0.,rim-y);
      float end=.41+.68*(.5+.5*cos(v*15.+k));
      float path=v*(.52-d*.14)+d*(.12*sin(d*8.-flow+v*8.)+.065*sin(d*17.+v*5.+flow));
      float delta=xx-path;float fiber=line(delta,.004+d*.002)+.14*line(delta,.019);
      col+=cyan*fiber*(.55+.45*sq(cos(d*25.-flow*2.+v*5.)))*smoothstep(-.02,.035,rim-y)*(1.-smoothstep(end-.1,end,d));
    }
  }return col;
}
`,
  `
float knot(vec3 p,float t,out vec2 local){
  float a=atan(p.y,p.x+.00001), b=a*1.5+t*.22+seed*.18;
  vec2 base=vec2(length(p.xy)-.78,p.z);
  vec2 twist=spin(-b)*base;
  if(twist.x<0.)twist=-twist;
  vec2 cord=twist-vec2(.28+.04*sin(t*.36),0.);
  local=vec2(a,atan(cord.y,cord.x+.00001));
  return length(cord)-(.165+.010*cos(local.y*12.+a*12.));
}
vec3 world(vec2 p,float t){
  vec3 bg=space(p,t);p*=1.10;
  mat2 tilt=spin(.72+.29*sin(t*.29)),roll=spin(t*.14+seed*.3);
  vec3 ro=vec3(0,0,3.6),rd=normalize(vec3(p,-3.05));ro.yz=tilt*ro.yz;rd.yz=tilt*rd.yz;ro.xy=roll*ro.xy;rd.xy=roll*rd.xy;
  float travel=0.,d=0.,nearD=2.;vec2 lt;vec3 h;
  for(int j=0;j<48;j++){h=ro+rd*travel;d=knot(h,t,lt);nearD=min(nearD,d);if(d<.003||travel>5.4)break;travel+=d*.81;}
  if(d>.006)return bg+vec3(.20,.045,.36)*line(nearD,.045);
  vec2 save=lt,e=vec2(.003,0.);vec3 n=normalize(vec3(knot(h+e.xyy,t,lt)-d,knot(h+e.yxy,t,lt)-d,knot(h+e.yyx,t,lt)-d));
  vec3 ref=reflect(rd,n);float bands=pow(.5+.5*cos(ref.y*9.+ref.x*5.+t*.21),4.);
  vec3 c=mix(vec3(.22,.055,.59),vec3(.63,.83,1.),bands);
  c=mix(c,vec3(.97,.21,.55),.6*sq(sin(ref.z*3.+seed)));
  float wire=pow(.5+.5*cos(save.y*34.+save.x*24.),9.);
  float stud=pow(.5+.5*cos(save.x*94.-save.y*5.),10.);
  return c*(.23+.84*bands+.3*wire)+vec3(.97,.86,1.)*(.47*wire*stud+.66*pow(1.-abs(dot(n,rd)),2.5));
}
`,
  `
vec3 world(vec2 p,float t){
  vec2 q=spin(-.36+.21*sin(t*.14+seed))*p;float phase=t*.22+seed;
  for(int j=0;j<5;j++){
    float k=float(j);q+=vec2(sin(q.y*(2.1+k*.37)+phase*.9+k)+.4*cos(q.x*3.-k),cos(q.x*(1.8+k*.29)-phase+k))*(.34-k*.037);
    q=spin(.37)*q;
  }
  float h=q.y*2.7+q.x+.36*sin(q.x*4.+phase);
  float slope=cos(h*5.+sin(q.x*4.));float metal=pow(.5+.5*slope,3.);
  vec3 col=mix(vec3(.009,.015,.078),mix(vec3(.05,.47,.94),vec3(.19,.92,.83),.5+.5*sin(h*2.+seed)),metal);
  float gold=line(sin(h*4.+.6*sin(q.y*3.)+.7),.21);
  col=mix(col,vec3(.98,.45,.17),gold*.87);
  float contour=pow(.5+.5*cos(h*59.+q.x*3.+phase),12.);
  col+=vec3(.78,.91,1.)*(.62*pow(metal,9.)+.33*contour*(.27+.73*metal));
  return col*(.79+.21*noise2(q*22.));
}
`,
  `
vec3 world(vec2 p,float t){
  p=spin(.08*sin(t*.24+seed))*p;
  float lid=.61-.42*p.x*p.x-abs(p.y+.055*cos(p.x*2.))+.05*sound.x;
  float eyelash=sin(atan(p.y,p.x+.0001)*122.+7.*sin(p.x*8.)+length(p)*18.);
  vec3 col=space(p,t);
  float ripple=lid*49.+2.2*sin(p.x*8.+p.y*4.+t*.42);
  col+=alloy(3.+p.y*4.+seed)*exp(-abs(lid)*3.)*(.16+.63*pow(.5+.5*cos(ripple),6.)+.21*pow(.5+.5*eyelash,8.));
  vec2 gaze=vec2(.16*sin(t*.51+seed),.085*sin(t*.32));vec2 q=p-gaze;
  float r=length(q),a=atan(q.y,q.x+.00001), pupil=.15+.053*sound.x+.018*sin(t*.6);
  if(lid>0.){
    float fiber=pow(.5+.5*cos(p.y*68.+4.*sin(p.x*11.+sin(p.y*15.))+p.x*14.-t*.35),8.);
    vec3 sclera=mix(vec3(.20,.022,.097),vec3(.90,.41,.30),.5+.33*cos(q.x*2.2));
    sclera*=.78+.22*fiber;sclera+=vec3(.88,.47,.34)*.26*line(lid,.06);
    float filaments=pow(.5+.5*cos(a*115.+6.*sin(a*12.+r*17.)+r*62.-t*.4),5.);
    float folds=.5+.5*cos(a*39.-r*31.+2.*cos(a*9.+r*23.+t*.45));
    vec3 irisColor=mix(vec3(.99,.32,.035),vec3(.11,.74,.77),.5+.49*sin(a*3.+r*12.+t*.2+seed));
    vec3 globe=irisColor*(.20+.69*filaments+.38*folds)+vec3(1.,.83,.46)*pow(folds,12.)*filaments;
    float lens=abs(fract(a/TAU*13.+.5)-.5)*2.;
    vec2 bead=vec2(lens,(r-.37)*24.);
    float inset=1.-bead.x*bead.x-abs(bead.y);
    globe+=vec3(1.,.61,.27)*.62*line(inset,.15);
    globe*=1.-.77*bell(length(bead)*2.9);
    float throat=-log(max(.001,r))*3.+t*.22;
    vec3 abyss=vec3(.014,.004,.019)+vec3(.54,.10,.18)*pow(.5+.5*cos(throat*9.+3.*sin(a*6.+throat)),12.)*.36;
    globe=mix(abyss,globe,smoothstep(pupil-.007,pupil+.008,r))+vec3(.99,.47,.07)*.65*line(r-pupil,.009);
    col=mix(sclera,globe,1.-smoothstep(.508,.535,r));
    col+=vec3(.93,.96,.85)*(.92*bell(length((q-vec2(-.16,.2))*vec2(.76,1.7))*19.)+.39*bell(length(q-vec2(-.23,.14))*43.));
    col*=.66+.34*smoothstep(0.,.23,lid);
  }
  return col+vec3(.96,.31,.22)*line(lid,.012);
}
`
]

const FINISH = `
void main(){
  vec2 aspect=vec2(size.x/size.y,1.);
  vec2 p=(uv-.5)*2.*aspect;p.y=-p.y;
  // Preserve the whole figure on portrait monitors.
  p*=max(1.,1.36/aspect.x);
  vec2 aim=(pointer-.5)*2.*aspect;aim.y=-aim.y;
  vec2 off=p-aim;float reach=exp(-1.9*dot(off,off));
  p+=off*reach*impulse*.36*sin(length(off)*9.-clock*2.);
  p+=.025*(pointer-.5);
  if(symmetry>.001){
    float a=atan(p.y,p.x+.00001),r=length(p);
    vec2 prism=r*vec2(cos(abs(mod(a+PI/5.,TAU/5.)-PI/5.)),sin(abs(mod(a+PI/5.,TAU/5.)-PI/5.)));
    p=mix(p,prism,symmetry);
  }
  vec3 cam=vec3(0.);float edge=0.;
  if(fusion>.001){
    vec2 coord=mediaUV(uv);
    cam=texture2D(imageIn,coord).rgb;
    vec2 n=2.8/size;
    vec2 grad=vec2(luma(texture2D(imageIn,coord+vec2(n.x,0.)).rgb),luma(texture2D(imageIn,coord+vec2(0.,n.y)).rgb))-luma(cam);
    edge=length(grad);p+=fusion*(.22*grad+.10*vec2(cam.r-cam.g,cam.b-.4));
  }
  p*=1.-.048*sound.x*energy;
  p=spin(.043*sound.y*energy*sin(3.*length(p)+clock*.16))*p;
  vec3 c=world(p,clock)*(1.+.24*sound.z*energy);
  c=mix(c,c*(.63+cam*1.25)+cam*.54+alloy(clock*.2+edge*7.)*edge*1.5,fusion);
  c=mix(c,cam*.87+c*.23+edge*alloy(clock*.2)*.45,smoothstep(.68,1.,fusion));
  vec3 axis=vec3(.57735);float ang=hue;
  c=c*cos(ang)+cross(axis,c)*sin(ang)+axis*dot(axis,c)*(1.-cos(ang));
  c=max(c,vec3(0.));c=1.-exp(-c*1.72);
  c=pow(c,vec3(.91));c+=(hash(gl_FragCoord.xy)-.5)*.012;
  gl_FragColor=vec4(c,1.);
}`
