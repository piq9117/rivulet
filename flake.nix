{
  description = "rivulte";
  inputs.nixpkgs.url = github:NixOS/nixpkgs/afe3d8ac4395617bdcdac9f188ac8717a062e014;
  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed;
      nixpkgsFor = forAllSystems (system: import nixpkgs {
        inherit system;
      });
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgsFor.${system};
        in
        {
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              typescript-language-server
              nodejs
              typescript
              treefmt
              nixpkgs-fmt
              biome
            ];
            shellHook = ''
              export PS1='[$PWD]\n❄ '
            '';
          };
        });
    };
}
