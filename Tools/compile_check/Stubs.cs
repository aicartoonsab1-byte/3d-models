// Минимальные заглушки UnityEditor/InputSystem — только для проверки компиляции вне Unity.
namespace UnityEditor {
  public class AssetPostprocessor { public string assetPath; public UnityEngine.Object assetImporter0; public AssetImporter assetImporter; }
  public class AssetImporter : UnityEngine.Object {}
  public enum TextureImporterType { Default, Sprite }
  public enum SpriteImportMode { None, Single, Multiple }
  public enum TextureImporterCompression { Uncompressed }
  public enum TextureImporterNPOTScale { None }
  public class TextureImporterSettings { public UnityEngine.SpriteMeshType spriteMeshType; public int spriteAlignment; }
  public class TextureImporter : AssetImporter {
    public TextureImporterType textureType; public SpriteImportMode spriteImportMode; public float spritePixelsPerUnit;
    public UnityEngine.FilterMode filterMode; public TextureImporterCompression textureCompression; public bool mipmapEnabled;
    public bool alphaIsTransparency; public UnityEngine.TextureWrapMode wrapMode; public TextureImporterNPOTScale npotScale;
    public void ReadTextureSettings(TextureImporterSettings s){} public void SetTextureSettings(TextureImporterSettings s){} }
  public class InitializeOnLoadAttribute : System.Attribute {}
  public class MenuItem : System.Attribute { public MenuItem(string s){} }
  public static class EditorApplication { public static System.Action delayCall; }
  public enum InsecureHttpOption { NotAllowed, DevelopmentOnly, AlwaysAllowed }
  public static class PlayerSettings { public static InsecureHttpOption insecureHttpOption; }
  [System.Flags] public enum ImportAssetOptions { Default=0, ForceUpdate=1, ImportRecursive=256 }
  public static class AssetDatabase { public static void ImportAsset(string p, ImportAssetOptions o){} }
  public static class EditorUtility { public static void RevealInFinder(string p){} }
}
#if ENABLE_INPUT_SYSTEM
namespace UnityEngine.InputSystem {
  public class ButtonControl { public bool wasPressedThisFrame; }
  public class Vector2Control { public UnityEngine.Vector2 ReadValue()=>default; }
  public class Keyboard { public static Keyboard current;
    public ButtonControl rKey,nKey,pKey,mKey,escapeKey,f1Key,f2Key,spaceKey,enterKey,digit1Key,digit2Key,digit3Key,digit4Key,digit5Key,digit6Key,digit7Key,digit8Key,digit9Key,anyKey; }
  public class Mouse { public static Mouse current; public ButtonControl leftButton; public Vector2Control position; }
}
#endif
